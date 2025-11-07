// Bu dosya Next.js App Router yapısına göre app/api/video-olustur/route.ts olmalıdır.
// Gerekli bağımlılık: @google/genai
// 'npm install @google/genai'

import { GoogleGenerativeAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

// --- Yardımcı Fonksiyonlar ---

// API'den gelen base64 verisini temizler
const cleanBase64 = (base64String) => {
  if (!base64String) return null;
  // 'data:image/png;base64,' gibi başlıkları kaldır
  return base64String.split(',')[1] || base64String;
};

// API yanıtını beklemek için (polling)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- Ana Fonksiyon (Handler) ---
// Next.js App Router için 'POST' fonksiyonu
export async function POST(req: NextRequest) {
  try {
    // Vercel/Next.js'in sunucusuz fonksiyonları için varsayılan zaman aşımını uzat
    // (Gerekirse vercel.json ile daha da uzatılabilir)
    console.log('Video oluşturma isteği alındı...');

    const { apiKey, prompt, aspectRatio, base64Image } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API anahtarı eksik.' }, { status: 401 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt (metin) eksik.' }, { status: 400 });
    }

    // 1. @google/genai kütüphanesini KULLANICIDAN GELEN API anahtarı ile başlat
    const ai = new GoogleGenerativeAI(apiKey);

    // 2. VEO 3.1 modelini seç
    const model = ai.getModel({ model: "veo-3.1-fast-generate-preview" });
    
    // 3. Giriş verilerini (video parts) hazırla
    const videoParts = [];
    
    if (base64Image) {
      const imageData = cleanBase64(base64Image);
      const mimeType = base64Image.match(/data:(image\/[a-zA-Z]+);base64,/)?.[1] || 'image/png';
      
      videoParts.push({
        inlineData: {
          data: imageData,
          mimeType: mimeType,
        },
      });
    }

    videoParts.push({ text: prompt });

    // 4. Video oluşturma ayarları
    const generationConfig = {
      aspectRatio: aspectRatio === '16:9' ? 'LANDSCAPE' : 'PORTRAIT',
    };

    // 5. Video oluşturma işlemini BAŞLAT
    console.log('VEO video oluşturma işlemi başlatılıyor...');
    const result = await model.generateVideo(videoParts, generationConfig);

    // 6. İşlemi (Operation) bekle (Polling)
    console.log('İşlem alındı, tamamlanması bekleniyor:', result.operation.name);
    
    let operation = await ai.operations.get(result.operation.name);
    // Vercel'in Pro planında maksimum 5dk (300s) bekleme süresi olabilir.
    // Hobby planında daha kısa olabilir (örn. 60s).
    // Uzun süren işlemler için bu mimari Vercel'de zorlanabilir.
    const maxPollTime = 4 * 60 * 1000; // 4 dakika bekle
    const pollInterval = 5000; // Her 5 saniyede bir kontrol et
    let elapsedTime = 0;

    while (!operation.done && elapsedTime < maxPollTime) {
      await sleep(pollInterval);
      operation = await ai.operations.get(result.operation.name);
      elapsedTime += pollInterval;
      console.log(`Durum: ${operation.metadata?.state || 'Bilinmiyor'}. Geçen süre: ${elapsedTime / 1000}s`);
    }

    if (!operation.done) {
      throw new Error(`Video oluşturma işlemi zaman aşımına uğradı (${elapsedTime / 1000}s). Vercel zaman aşımı olabilir.`);
    }

    if (operation.error) {
       throw new Error(`Video oluşturma hatası: ${operation.error.message}`);
    }
    
    // 7. Başarılı video dosyasının URI'sini al
    const videoFile = operation.response?.videoFiles?.[0];

    if (!videoFile || !videoFile.uri) {
      console.error('API yanıtı beklenmedik formatta:', JSON.stringify(operation.response, null, 2));
      throw new Error('Video dosyası API yanıtında bulunamadı.');
    }
    
    console.log('Video başarıyla oluşturuldu:', videoFile.uri);

    // 8. Video URL'ini arayüze döndür
    return NextResponse.json({ videoUrl: videoFile.uri }, { status: 200 });

  } catch (error) {
    console.error('Sunucusuz fonksiyon hatası:', error);
    // Hata mesajını string'e çevir
    const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen bir sunucu hatası oluştu.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}