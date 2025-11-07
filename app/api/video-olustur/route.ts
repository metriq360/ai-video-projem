// "Mutfak" (Backend) Kodu - M PLANI (ChatGP Çözümü Entegre)
// Bu plan, Veo'yu doğru metodla (videos.generate) çağırmayı içerir.

// Not: Google'ın en son SDK'sında (v0.15.0+), Veo için 'videos' adında ayrı bir obje bulunur.
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
    // 'GoogleGenAI' (yeni isim) kullanılıyor
    const ai = new GoogleGenAI(apiKey);
    
    // ************* M PLANI - KESİN ÇÖZÜM *************
    // 1. Yeni ve doğru metot: ai.videos.generate() çağrısı yapılıyor.
    // 2. Bu metot, Long-Running-Operation (LRO) döndürüyor, polling gerekiyor.

    const modelName = 'veo-3.1-fast-generate-preview'; 

    // 2. Giriş verilerini (video parts) hazırla
    const videoParts = [];

    // Image-to-Video için görsel ekle
    const cleanedImage = cleanBase64(base64Image);
    if (cleanedImage) {
      videoParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: cleanedImage,
        },
      });
    }

    // Video oluşturma isteği
    const requestPayload = {
        model: modelName,
        prompt: prompt,
        aspectRatio: aspectRatio || '16:9',
        // Görsel varsa, payload'a eklenir.
        // GoogleAIClient'ın videos.generate metodu, prompt ve görseli ayrı ayrı kabul eder
        // Bu yapı, VEO'nun en son gereksinimlerine uygundur.
    };
    
    // Eğer başlangıç görseli varsa, prompt'u ayrı, görseli ayrı yolluyoruz.
    // Aksi takdirde sadece metin yolluyoruz.
    if (cleanedImage) {
        (requestPayload as any).initImage = videoParts[0]; // İlk kısım initImage olmalı
        (requestPayload as any).prompt = prompt;
        // aspectRatio zaten requestPayload içinde
    } else {
        (requestPayload as any).prompt = prompt;
    }


    // 3. Video oluşturma işlemini BAŞLAT
    // (ai as any) kullanımı, TypeScript'in inatçı tip tanımlarını susturmak içindir.
    const result = await (ai as any).videos.generate(requestPayload);
    
    // 4. İşlemi (Operation) bekle (Polling)
    let operation = await (ai as any).operations.get(result.operation.name);
    
    const maxPollTime = 10 * 60 * 1000; 
    const pollInterval = 5000; 
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

    // 5. Başarılı video dosyasının URI'sini al
    const videoFile = operation.response?.videoFiles?.[0];

    if (!videoFile || !videoFile.uri) {
        throw new Error('Video dosyası API yanıtında bulunamadı.');
    }
    
    // 6. Video URL'ini arayüze döndür
    return NextResponse.json({ videoUrl: videoFile.uri });

  } catch (error) {
    console.error('VEO API HATASI (Sunucu):', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}