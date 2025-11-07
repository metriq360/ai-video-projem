// "Mutfak" (Backend) Kodu
// VEO 3.1 çağrısını yapacak sunucusuz fonksiyon (app/api/video-olustur/route.ts)

// D PLANI: Bu kod, Vercel'in en yeni @google/genai paketini kullanmasını ZORLADIKTAN SONRA çalışacak.
// Hata 'getGenerativeModel' ise, sorun paketin güncellenmemiş olmasıdır.

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

// --- Yardımcı Fonksiyonlar ---

// API'den gelen base64 verisini temizler
// 'base64String' parametresine 'string | null' tipi eklendi (Düzeltme 2)
const cleanBase64 = (base64String: string | null): string | null => {
  if (!base64String) return null;
  // 'data:image/png;base64,' gibi başlıkları kaldır
  return base64String.split(',')[1] || base64String;
};

// --- ANA FONKSİYON (POST Isteği) ---
export async function POST(req: NextRequest) {
  try {
    // 1. İsteğin gövdesini (body) al
    const body = await req.json();
    const { apiKey, prompt, aspectRatio, base64Image } = body;

    // --- Güvenlik Kontrolleri ---
    if (!apiKey) {
      return NextResponse.json({ error: 'API anahtarı eksik' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt metni eksik' }, { status: 400 });
    }

    // --- Google AI'yi Başlat ---
    // ************* DÜZELTME 1 *************
    // 'GoogleGenerativeAI' -> 'GoogleGenAI' olarak düzeltildi
    const ai = new GoogleGenAI(apiKey);

    // ************* DÜZELTME 3 *************
    // 'getModel' -> 'getGenerativeModel' olarak düzeltildi
    // ************* D PLANI *************
    // '(ai as any)' kaldırıldı. Artık Vercel'in doğru paketi kurduğuna güveniyoruz.
    const model = ai.getGenerativeModel({ model: "veo-3.1-fast-generate-preview" });

    // 3. Giriş verilerini (video parts) hazırla
    const videoParts = [];

    // Başlangıç görseli varsa (Image-to-Video)
    const cleanedImage = cleanBase64(base64Image);
    if (cleanedImage) {
      videoParts.push({
        inlineData: {
          mimeType: 'image/png', // veya 'image/jpeg' vb.
          data: cleanedImage,
        },
      });
    }

    // Ana video metnini (prompt) ekle
    videoParts.push({ text: `Video prompt: ${prompt}` });

    // En-boy oranını ekle
    videoParts.push({ text: `En-boy oranı: ${aspectRatio || '16:9'}` });

    // 4. Videoyu oluştur (generateVideos)
    const result = await model.generateContent({
      content: {
        role: 'user',
        parts: videoParts,
      },
      // Güvenlik ayarlarını VEO için esnet
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    // 5. Cevabı (result) işle
    // VEO 3.1 (veo-3.1-fast-generate-preview) doğrudan video URI'lerini döndürür, 'operations' beklemeye gerek yok.
    const videoData = result.response.candidates?.[0].content.parts
      .filter(part => part.videoMetadata)
      .map(part => part.videoMetadata?.videoUri);

    if (!videoData || videoData.length === 0 || !videoData[0]) {
      throw new Error('VEO API video URI döndürmedi. Model cevabını kontrol edin.');
    }

    // 6. Başarılı cevabı (video URL'i) arayüze döndür
    return NextResponse.json({ videoUrl: videoData[0] });

  } catch (error) {
    console.error('VEO API HATASI (Sunucu):', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Hata mesajını arayüze (frontend) gönder
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}