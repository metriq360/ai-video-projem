// "Mutfak" (Backend) Kodu - K PLANI
// Bu plan, VEO'nun kendi generateVideo metodunu kullanır, 
// böylece getGenerativeModel hatalarından kaçınılır.

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

// --- Yardımcı Fonksiyonlar ---
const cleanBase64 = (base64String: string | null): string | null => {
  if (!base64String) return null;
  return base64String.split(',')[1] || base64String;
};

// API yanıtını beklemek için (polling)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- ANA FONKSİYON (POST Isteği) ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey, prompt, aspectRatio, base64Image } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'API anahtarı eksik.' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt (metin) eksik.' }, { status: 400 });
    }

    // --- Google AI'yi Başlat ---
    // Bu sefer 'GoogleGenAI' (yeni isim) kullanıyoruz.
    const ai = new GoogleGenAI(apiKey);

    // ************* K PLANI *************
    // 1. Doğrudan generateVideo metodunu kullanıyoruz (getGenerativeModel'den kaçınıyoruz)
    // 2. Bu metot, Long-Running-Operation (LRO) döndürdüğü için polling yapmalıyız.

    const model = 'veo-3.1-fast-generate-preview'; 

    // 2. Giriş verilerini (video parts) hazırla
    const videoParts = [];

    // Başlangıç görseli varsa (Image-to-Video)
    const cleanedImage = cleanBase64(base64Image);
    if (cleanedImage) {
      videoParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: cleanedImage,
        },
      });
    }

    // Ana video metnini (prompt) ekle
    videoParts.push({ text: `Video prompt: ${prompt}` });

    // 3. Konfigürasyonu hazırla
    const config = {
      model: model,
      // En-boy oranı
      aspectRatio: aspectRatio || '16:9', 
      // VEO 3.1, generateVideo'da 'durationSeconds' kabul eder
      durationSeconds: 30, // Default 30 saniye olarak varsayalım.
    };

    // 4. Video oluşturma işlemini BAŞLAT (LRO döndürecek)
    const result = await (ai as any).generateVideo(videoParts, config);
    
    // 5. İşlemi (Operation) bekle (Polling)
    let operation = await (ai as any).operations.get(result.operation.name);
    
    const maxPollTime = 10 * 60 * 1000; // Maksimum 10 dakika bekle
    const pollInterval = 5000; // Her 5 saniyede bir kontrol et
    let elapsedTime = 0;

    while (!operation.done && elapsedTime < maxPollTime) {
        await sleep(pollInterval);
        operation = await (ai as any).operations.get(result.operation.name);
        elapsedTime += pollInterval;
        console.log(`Durum: ${operation.metadata?.state || 'Bilinmiyor'}. Geçen süre: ${elapsedTime / 1000}s`);
    }

    if (!operation.done) {
        throw new Error('Video oluşturma işlemi zaman aşımına uğradı.');
    }

    if (operation.error) {
       throw new Error(`VEO API Hatası: ${operation.error.message}`);
    }

    // 6. Başarılı video dosyasının URI'sini al
    const videoFile = operation.response?.videoFiles?.[0];

    if (!videoFile || !videoFile.uri) {
        throw new Error('Video dosyası API yanıtında bulunamadı.');
    }
    
    // 7. Video URL'ini arayüze döndür
    return NextResponse.json({ videoUrl: videoFile.uri });

  } catch (error) {
    console.error('VEO API HATASI (Sunucu):', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}