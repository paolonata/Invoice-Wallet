package com.invoicewallet.app;

import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Ponte fra la pagina e Android per far uscire i file (backup e foto).
 * Dentro una WebView i download "blob:" non funzionano, quindi la pagina
 * manda il contenuto a pezzi e qui viene scritto davvero su disco.
 */
public class FileBridge {

  private static final long MAX_BYTES = 2L * 1024 * 1024 * 1024; // limite di sicurezza: 2 GB

  private final MainActivity activity;
  private final Map<String, Transfer> transfers = new ConcurrentHashMap<>();

  FileBridge(MainActivity activity) {
    this.activity = activity;
  }

  private static class Transfer {
    File file;
    String name;
    String mime;
    OutputStream out;
    long written;
  }

  /** Segnala alla pagina che gira dentro l'app Android. */
  @JavascriptInterface
  public String platform() {
    return "android";
  }

  @JavascriptInterface
  public String versionName() {
    return BuildConfig.VERSION_NAME;
  }

  /** La pagina chiede se questo dispositivo sa leggere il testo dalle foto. */
  @JavascriptInterface
  public boolean canReadText() {
    return true;
  }

  /** Apre un trasferimento e restituisce il token da usare nei pezzi. */
  @JavascriptInterface
  public String fileBegin(String name, String mime) {
    try {
      String token = UUID.randomUUID().toString();
      Transfer t = new Transfer();
      t.name = sanitize(name);
      t.mime = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
      File dir = new File(activity.getCacheDir(), "uscita");
      if (!dir.exists() && !dir.mkdirs()) return "";
      t.file = new File(dir, token + "_" + t.name);
      t.out = new FileOutputStream(t.file);
      transfers.put(token, t);
      return token;
    } catch (Exception e) {
      return "";
    }
  }

  /** Accoda un pezzo codificato in base64. */
  @JavascriptInterface
  public boolean fileChunk(String token, String base64) {
    Transfer t = transfers.get(token);
    if (t == null) return false;
    try {
      byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
      if (t.written + bytes.length > MAX_BYTES) throw new IllegalStateException("file troppo grande");
      t.out.write(bytes);
      t.written += bytes.length;
      return true;
    } catch (Exception e) {
      abort(token);
      return false;
    }
  }

  /**
   * Chiude il trasferimento.
   * @param mode "save" per salvare in Download, "share" per aprire la condivisione.
   * @return descrizione di dove è finito il file, stringa vuota se è andata male.
   */
  @JavascriptInterface
  public String fileEnd(String token, String mode) {
    Transfer t = transfers.remove(token);
    if (t == null) return "";
    try {
      t.out.flush();
      t.out.close();
      if ("share".equals(mode)) return share(t);
      if ("ocr".equals(mode)) return readText(t);
      return saveToDownloads(t);
    } catch (Exception e) {
      return "";
    } finally {
      if (!"share".equals(mode)) deleteQuietly(t.file);
    }
  }

  @JavascriptInterface
  public void fileAbort(String token) {
    abort(token);
  }

  /* ── Uscite ─────────────────────────────────────────────────────────── */

  private String saveToDownloads(Transfer t) throws Exception {
    ContentValues values = new ContentValues();
    values.put(MediaStore.Downloads.DISPLAY_NAME, t.name);
    values.put(MediaStore.Downloads.MIME_TYPE, t.mime);
    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Invoice Wallet");
    values.put(MediaStore.Downloads.IS_PENDING, 1);

    Uri target = activity.getContentResolver()
        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
    if (target == null) return "";

    try (InputStream in = new java.io.FileInputStream(t.file);
         OutputStream out = activity.getContentResolver().openOutputStream(target)) {
      if (out == null) return "";
      byte[] buffer = new byte[64 * 1024];
      int read;
      while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
    }

    values.clear();
    values.put(MediaStore.Downloads.IS_PENDING, 0);
    activity.getContentResolver().update(target, values, null, null);

    return "Download/Invoice Wallet/" + t.name;
  }

  /**
   * Legge il testo stampato sulla foto. Tutto in locale: l'immagine non esce
   * dal telefono e non serve connessione.
   */
  private String readText(Transfer t) {
    TextRecognizer recognizer = null;
    Bitmap bitmap = null;
    try {
      BitmapFactory.Options opts = new BitmapFactory.Options();
      opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
      bitmap = BitmapFactory.decodeFile(t.file.getAbsolutePath(), opts);
      if (bitmap == null) return "";

      recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
      // Il ponte JavaScript gira fuori dal thread principale: qui si può attendere.
      return Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 25, TimeUnit.SECONDS)
          .getText();
    } catch (Exception e) {
      return "";
    } finally {
      if (recognizer != null) recognizer.close();
      if (bitmap != null) bitmap.recycle();
    }
  }

  private String share(Transfer t) {
    Uri uri = FileProvider.getUriForFile(
        activity, activity.getPackageName() + ".fileprovider", t.file);
    Intent send = new Intent(Intent.ACTION_SEND);
    send.setType(t.mime);
    send.putExtra(Intent.EXTRA_STREAM, uri);
    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    Intent chooser = Intent.createChooser(send, activity.getString(R.string.share_with));
    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    activity.startActivity(chooser);
    return "condiviso";
  }

  private void abort(String token) {
    Transfer t = transfers.remove(token);
    if (t == null) return;
    try { t.out.close(); } catch (Exception ignored) { }
    deleteQuietly(t.file);
  }

  private static void deleteQuietly(File f) {
    if (f != null && f.exists() && !f.delete()) f.deleteOnExit();
  }

  /** Niente percorsi nel nome del file. */
  private static String sanitize(String name) {
    String clean = (name == null ? "" : name).replaceAll("[\\\\/:*?\"<>|]", "_").trim();
    if (clean.isEmpty()) clean = "invoice-wallet";
    return clean.length() > 120 ? clean.substring(clean.length() - 120) : clean;
  }
}
