// Bu dosya Vercel/Next.js App Router için Backend kodudur. (app/api/video-olustur/route.ts)
// P PLANI: SDK Hatalarını Atlamak için DOĞRUDAN REST API ÇAĞRISI kullanılır.

import { NextRequest, NextResponse } from 'next/server';

// --- SABİTLER ---
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';
const MAX_POLL_TIME = 10 * 60 * 1000; // Maksimum 10 dakika bekle
const POLL_INTERVAL = 5000; // Her 5 saniyede bir kontrol et

// --- Yardımcı Fonksiyonlar ---

// API'den gelen base64 verisini temizler
const cleanBase64 = (base64String: string | null): string | null => {
  if (!base64String) return null;
  // 'data:image/png;base64,' gibi başlıkları kaldır
  return base64String.split(',')[1] || base64String;
};

// --- ANA FONKSİYON (POST Isteği) ---
export async function POST(req: NextRequest) {
  try {
    const { apiKey, prompt, aspectRatio, base64Image } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API anahtarı eksik.' }, { status: 401 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt (metin) eksik.' }, { status: 400 });
    }
    
    // 1. İsteğin gövdesini (body) VEO'nun istediği formata dönüştür
    const videoParts = [];

    // Image-to-Video için görsel ekle
    const cleanedImage = cleanBase64(base64Image);
    if (cleanedImage) {
      const mimeType = base64Image.match(/data:(image\/[a-zA-Z]+);base64,/)?.[1] || 'image/png';
      videoParts.push({
        inlineData: {
          data: cleanedImage,
          mimeType: mimeType,
        },
      });
    }

    // Text-to-Video için metni ekle
    videoParts.push({ text: prompt });

    const requestBody = {
      model: VEO_MODEL,
      contents: [
        {
          role: 'user',
          parts: videoParts,
        },
      ],
      config: {
        aspectRatio: aspectRatio === '16:9' ? 'LANDSCAPE' : 'PORTRAIT',
        // safetySettings (Güvenlik Ayarları) ve diğer parametreler eklenebilir
      }
    };

    // 2. Video oluşturma işlemini BAŞLAT (REST API Çağrısı)
    const initResponse = await fetch(`${API_BASE_URL}/models/${VEO_MODEL}:generateVideos?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        // Google'ın LRO isteğini tamamlaması için timeout'u artırıyoruz
        signal: AbortSignal.timeout(MAX_POLL_TIME), 
    });

    if (!initResponse.ok) {
        const errorData = await initResponse.json();
        const errorMessage = errorData.error?.message || 'Video başlatma isteği başarısız oldu.';
        throw new Error(`REST API Başlatma Hatası: ${errorMessage}`);
    }

    const initData = await initResponse.json();
    const operationName = initData.name;

    if (!operationName) {
        throw new Error('API yanıtında Operation Name bulunamadı.');
    }

    // 3. İşlemi bekle (Polling - Durum Kontrolü)
    let operationUrl = `${API_BASE_URL}/operations/${operationName}?key=${apiKey}`;
    let operation = null;
    let elapsedTime = 0;

    while (elapsedTime < MAX_POLL_TIME) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      elapsedTime += POLL_INTERVAL;

      const pollResponse = await fetch(operationUrl);
      if (!pollResponse.ok) {
        throw new Error(`Polling sırasında API hatası. Durum: ${pollResponse.status}`);
      }
      operation = await pollResponse.json();

      if (operation.done) break;
      console.log(`Durum: ${operation.metadata?.state || 'Bilinmiyor'}. Geçen süre: ${elapsedTime / 1000}s`);
    }

    if (!operation || !operation.done) {
      throw new Error('Video oluşturma işlemi zaman aşımına uğradı veya tamamlanamadı.');
    }

    if (operation.error) {
       throw new Error(`Video oluşturma hatası: ${operation.error.message}`);
    }

    // 4. Başarılı video dosyasının URI'sini al
    const videoFile = operation.response?.videoFiles?.[0];
    if (!videoFile || !videoFile.uri) {
      throw new Error('Video dosyası yanıt formatında bulunamadı.');
    }
    
    // 5. Video URL'ini arayüze döndür
    return NextResponse.json({ videoUrl: videoFile.uri });

  } catch (error) {
    console.error('Sunucusuz fonksiyon hatası:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}