# Il ponte JavaScript viene chiamato per nome dalla pagina: non va offuscato.
-keepclassmembers class com.invoicewallet.app.FileBridge {
  public *;
}
