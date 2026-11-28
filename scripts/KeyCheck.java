import java.io.File;
import java.security.KeyStore;

/**
 * Android imza anahtarının şifresini derlemeden önce dener (.github/workflows/android.yml).
 * Şifreler ortam değişkenlerinden okunur, komut satırında görünmez.
 *
 *   CHECK_STORE_PASSWORD=... CHECK_KEY_PASSWORD=... java scripts/KeyCheck.java <keystore> <alias>
 *
 * Anahtar bu şifreyle açılıyorsa 0, açılmıyorsa 1 ile çıkar.
 */
public class KeyCheck {
  public static void main(String[] args) {
    try {
      KeyStore ks = KeyStore.getInstance(new File(args[0]), System.getenv("CHECK_STORE_PASSWORD").toCharArray());
      if (ks.getKey(args[1], System.getenv("CHECK_KEY_PASSWORD").toCharArray()) == null) System.exit(1);
    } catch (Exception e) {
      System.exit(1);
    }
  }
}
