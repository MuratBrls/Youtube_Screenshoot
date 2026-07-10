# 🎬 YouTube Frame Catcher & Metadata Stamper (v1.4)

YouTube videolarından **orijinal çözünürlükte** (1080p, 4K vb.) kayıpsız TIF veya JPG formatında tek tıkla ekran görüntüsü alan, klavye kısayolu destekleyen ve dosyaları doğrudan seçtiğiniz klasöre kaydeden modern bir tarayıcı eklentisi.

![Manifest](https://img.shields.io/badge/Manifest-V3-green)
![Compatibility](https://img.shields.io/badge/OS-Windows%20%7C%20macOS-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Özellikler

- 📷 **Tek Tıkla Yakalama** — YouTube oynatıcı kontrollerine entegre kamera butonu.
- ⚙️ **Oynatıcı İçi Ayarlar** — Oynatıcıdaki çark simgesiyle anında açılan minimalist ayarlar paneli.
- 📁 **Doğrudan Klasör Seçimi (FSA API)** — İndirilenler klasörünü her seferinde sormaz. İstediğiniz herhangi bir klasörü bir kez seçin, doğrudan oraya kaydetsin.
- ⌨️ **Kişiselleştirilebilir Kısayol** — İstediğiniz tuşu (Varsayılan `P`) kısayol olarak atayın.
- 🖼️ **Format Seçimi** — Kayıpsız **TIF** veya sıkıştırılmış **JPG** formatları panelden değiştirilebilir.
- 🏷️ **Temiz Dosya Adı** — Görsel üzerinde hiçbir logo/yazı barındırmaz. Dosya ismini otomatik oluşturur: `KanalAdı_VideoBaşlığı_Dakika-Saniye.jpg`.
- ☁️ **iOS Tarzı Minimal Bildirim** — Ekran görüntüsü alındığında sağ üst köşeden kayarak çıkan modern beyaz bildirim.

---

## 📁 Proje Yapısı

```
Youtube_Screenshoot/
├── manifest.json       ← Eklenti ayarları ve izinler (Manifest V3)
├── content.js          ← YouTube oynatıcısına butonu ve paneli enjekte eden ana kod
├── background.js       ← İndirme işlemlerini yöneten servis
├── utif.js             ← Fotopea tarafından geliştirilen kayıpsız TIF kodlayıcı
├── popup.html          ← Eklenti üst bar popup arayüzü
├── popup.js            ← Popup kontrol mantığı
└── icons/              ← Eklenti logoları
```

---

## 🚀 Kurulum (Windows / macOS)

Eklentiyi tarayıcınıza yüklemek için:

1. Bu depoyu bilgisayarınıza indirin (veya klonlayın):
   ```bash
   git clone https://github.com/MuratBrls/Youtube_Screenshoot.git
   ```
2. Tarayıcınızda (Chrome veya Edge) `chrome://extensions/` adresine gidin.
3. Sağ üstteki **Geliştirici Modu (Developer Mode)** seçeneğini aktif hale getirin.
4. Sol üstteki **Paketlenmemiş öğe yükle (Load unpacked)** butonuna tıklayın.
5. Klonladığınız/indirdiğiniz klasörü seçin.
6. Eklenti hemen aktif olacaktır.

---

## ⚙️ Nasıl Kullanılır?

1. Herhangi bir YouTube videosu açın.
2. Video kontrollerinin sağ tarafına gelen **çark (⚙️) simgesine** tıklayın.
3. **Kayıt Klasörü** alanına tıklayarak bilgisayarınızdan ekran resimlerinin kaydedileceği klasörü seçin (Bu klasör IndexedDB üzerinde güvenli bir şekilde saklanır).
4. İstediğiniz **Formatı (JPG / TIF)** ve kullanmak istediğiniz **Kısayolu** belirleyin.
5. Ekran görüntüsü almak için **Kamera (📷) simgesine** veya atadığınız kısayol tuşuna (örneğin **P**) basın.
6. Sağ üstte çıkacak şık bildirimle görseliniz doğrudan seçtiğiniz klasöre kaydedilecektir.

---

## 📄 Lisans

MIT — İstediğiniz gibi kullanabilir, değiştirebilir ve dağıtabilirsiniz.
