package com.invoicewallet.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

import java.io.File;

/**
 * Contenitore nativo dell'app: una WebView che carica la PWA impacchettata
 * dentro l'APK. Niente rete, niente server: le foto restano nell'archivio
 * privato dell'applicazione.
 */
public class MainActivity extends AppCompatActivity {

  /** Dominio fittizio: serve per avere un'origine sicura (https) offline. */
  private static final String ORIGIN = "https://appassets.androidplatform.net";
  private static final String START_URL = ORIGIN + "/index.html";
  private static final int REQ_FILE_CHOOSER = 1001;
  private static final int REQ_CAMERA = 1002;

  private WebView webView;
  private WebViewAssetLoader assetLoader;
  private ValueCallback<Uri[]> pendingFileCallback;
  private Uri pendingCameraOutput;
  private PermissionRequest pendingCameraPermission;

  @Override
  @SuppressLint("SetJavaScriptEnabled")
  protected void onCreate(@Nullable Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    assetLoader = new WebViewAssetLoader.Builder()
        .setDomain("appassets.androidplatform.net")
        .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
        .build();

    webView = new WebView(this);
    setContentView(webView);

    WebSettings s = webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setSupportZoom(false);
    s.setTextZoom(100);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

    webView.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return assetLoader.shouldInterceptRequest(request.getUrl());
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (ORIGIN.equals(url.getScheme() + "://" + url.getHost())) return false;
        // Qualsiasi link esterno esce dall'app e va al browser.
        startActivity(new Intent(Intent.ACTION_VIEW, url));
        return true;
      }
    });

    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                       FileChooserParams params) {
        return openPicker(callback, params);
      }

      /*
       * La pagina chiede la fotocamera per mostrare l'inquadratura.
       * Il permesso di sistema si chiede una volta sola; se manca, la
       * richiesta viene negata e la pagina propone la fotocamera del telefono.
       */
      @Override
      public void onPermissionRequest(PermissionRequest request) {
        boolean vuoleVideo = false;
        for (String risorsa : request.getResources()) {
          if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(risorsa)) vuoleVideo = true;
        }
        if (!vuoleVideo) { request.deny(); return; }

        if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
          request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
          return;
        }
        pendingCameraPermission = request;
        ActivityCompat.requestPermissions(MainActivity.this,
            new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
      }

      @Override
      public void onPermissionRequestCanceled(PermissionRequest request) {
        pendingCameraPermission = null;
      }
    });

    // Il service worker della PWA deve leggere gli stessi asset locali.
    if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
      ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
          return assetLoader.shouldInterceptRequest(request.getUrl());
        }
      });
    }

    webView.addJavascriptInterface(new FileBridge(this), "AndroidHost");

    /*
     * Tasto Indietro, nell'ordine che si aspetta chi usa un telefono:
     * prima chiude quello che è aperto sopra la pagina (foto a schermo
     * intero, schede, conferme), poi torna alla schermata precedente,
     * infine esce dall'app.
     */
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        webView.evaluateJavascript(
            "(function(){try{return !!(window.chiudiSovrapposizione && window.chiudiSovrapposizione())}catch(e){return false}})()",
            risposta -> {
              if ("true".equals(risposta)) return;      // ci ha pensato la pagina
              if (webView.canGoBack()) webView.goBack();
              else finish();
            });
      }
    });

    if (savedInstanceState != null) webView.restoreState(savedInstanceState);
    else webView.loadUrl(START_URL);

    UpdateChecker.checkInBackground(this);
  }

  @Override
  protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    webView.saveState(outState);
  }

  /* ── Scelta delle foto: fotocamera o galleria ──────────────────────── */

  private boolean openPicker(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
    if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
    pendingFileCallback = callback;
    pendingCameraOutput = null;

    Intent camera = buildCameraIntent();
    boolean multiple = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;

    Intent target;
    if (params.isCaptureEnabled() && camera != null) {
      // input con capture="environment": si va dritti alla fotocamera.
      target = camera;
    } else {
      Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
      pick.addCategory(Intent.CATEGORY_OPENABLE);
      pick.setType("image/*");
      pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
      target = Intent.createChooser(pick, getString(R.string.pick_photos));
      if (camera != null) {
        target.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
      }
    }

    try {
      startActivityForResult(target, REQ_FILE_CHOOSER);
      return true;
    } catch (SecurityException e) {
      // Succede se il permesso fotocamera è stato negato: lo chiedo e basta.
      pendingFileCallback = null;
      ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
      return false;
    } catch (Exception e) {
      pendingFileCallback = null;
      Toast.makeText(this, R.string.no_camera_app, Toast.LENGTH_LONG).show();
      return false;
    }
  }

  @Nullable
  private Intent buildCameraIntent() {
    Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
    if (capture.resolveActivity(getPackageManager()) == null) return null;
    try {
      File dir = new File(getCacheDir(), "scatti");
      if (!dir.exists() && !dir.mkdirs()) return null;
      File photo = new File(dir, "scontrino_" + System.currentTimeMillis() + ".jpg");
      pendingCameraOutput = FileProvider.getUriForFile(
          this, getPackageName() + ".fileprovider", photo);
      capture.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraOutput);
      capture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
      return capture;
    } catch (Exception e) {
      pendingCameraOutput = null;
      return null;
    }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permessi, int[] esiti) {
    super.onRequestPermissionsResult(requestCode, permessi, esiti);
    if (requestCode != REQ_CAMERA || pendingCameraPermission == null) return;

    boolean concesso = esiti.length > 0 && esiti[0] == PackageManager.PERMISSION_GRANTED;
    if (concesso) {
      pendingCameraPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
    } else {
      pendingCameraPermission.deny();
    }
    pendingCameraPermission = null;
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
    if (requestCode != REQ_FILE_CHOOSER) {
      super.onActivityResult(requestCode, resultCode, data);
      return;
    }
    if (pendingFileCallback == null) return;

    Uri[] result = null;
    if (resultCode == Activity.RESULT_OK) {
      if (data == null || (data.getData() == null && data.getClipData() == null)) {
        // Nessun dato: è lo scatto finito nel file che avevamo preparato.
        if (pendingCameraOutput != null) result = new Uri[]{pendingCameraOutput};
      } else {
        result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
      }
    }

    pendingFileCallback.onReceiveValue(result);
    pendingFileCallback = null;
    pendingCameraOutput = null;
  }

  /** Messaggio breve richiamabile dal ponte JavaScript. */
  void toast(String message) {
    runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
  }
}
