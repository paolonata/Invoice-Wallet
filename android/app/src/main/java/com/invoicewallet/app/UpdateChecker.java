package com.invoicewallet.app;

import android.content.Intent;
import android.net.Uri;

import androidx.appcompat.app.AlertDialog;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;

/**
 * Controllo aggiornamenti: chiede a GitHub qual è l'ultima versione pubblicata.
 * Se ce n'è una nuova, propone di scaricarla. L'APK è firmato sempre con la
 * stessa chiave, quindi si installa sopra quello vecchio e i dati restano.
 */
final class UpdateChecker {

  private static final long CHECK_EVERY_MS = 12 * 60 * 60 * 1000L; // due volte al giorno
  private static final String PREFS = "aggiornamenti";
  private static final String LAST_CHECK = "ultimo_controllo";

  private UpdateChecker() { }

  static void checkInBackground(MainActivity activity) {
    if ("dev".equals(BuildConfig.RELEASE_TAG)) return; // build locale: niente controllo

    var prefs = activity.getSharedPreferences(PREFS, MainActivity.MODE_PRIVATE);
    long last = prefs.getLong(LAST_CHECK, 0);
    if (System.currentTimeMillis() - last < CHECK_EVERY_MS) return;

    Executors.newSingleThreadExecutor().execute(() -> {
      try {
        JSONObject release = fetchLatestRelease();
        if (release == null) return;

        prefs.edit().putLong(LAST_CHECK, System.currentTimeMillis()).apply();

        String tag = release.optString("tag_name", "");
        if (tag.isEmpty() || tag.equals(BuildConfig.RELEASE_TAG)) return;

        String apkUrl = findApkUrl(release);
        if (apkUrl == null) return;

        activity.runOnUiThread(() -> new AlertDialog.Builder(activity)
            .setTitle(R.string.update_title)
            .setMessage(activity.getString(R.string.update_message, tag))
            .setPositiveButton(R.string.update_download, (d, w) ->
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl))))
            .setNegativeButton(R.string.update_later, null)
            .show());
      } catch (Exception ignored) {
        // Nessuna rete o GitHub irraggiungibile: l'app funziona lo stesso.
      }
    });
  }

  private static JSONObject fetchLatestRelease() throws Exception {
    URL url = new URL("https://api.github.com/repos/" + BuildConfig.UPDATE_REPO + "/releases/latest");
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
    conn.setRequestProperty("Accept", "application/vnd.github+json");
    conn.setRequestProperty("User-Agent", "InvoiceWallet-Android");
    conn.setConnectTimeout(8000);
    conn.setReadTimeout(8000);
    try {
      if (conn.getResponseCode() != 200) return null;
      StringBuilder sb = new StringBuilder();
      try (BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
      }
      return new JSONObject(sb.toString());
    } finally {
      conn.disconnect();
    }
  }

  private static String findApkUrl(JSONObject release) {
    JSONArray assets = release.optJSONArray("assets");
    if (assets == null) return null;
    for (int i = 0; i < assets.length(); i++) {
      JSONObject asset = assets.optJSONObject(i);
      if (asset == null) continue;
      String name = asset.optString("name", "");
      if (name.endsWith(".apk")) return asset.optString("browser_download_url", null);
    }
    return null;
  }
}
