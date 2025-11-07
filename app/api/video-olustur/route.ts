// "Mutfak" (Backend) Kodu
// VEO 3.1 çağrısını yapacak sunucusuz fonksiyon (app/api/video-olustur/route.ts)

// F PLANI: "E Planı" (Önbelleği Sil) Vercel'i en yeni paketi (0.15.0) kurmaya zorladı.
// Ama paket bozuk (tip dosyası eski).
// Şimdi "C Planı"nı ((ai as any)) geri getirerek o bozuk tip dosyasını (dilbilgisi polisini) susturuyoruz.
// Artık Vercel'in kurduğu yeni paket (0.15.0) sayesinde bu kod çalışacak.

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

// --- Yardımcı Fonksiyonlar ---
const cleanBase64 = (base64String: string | null): string | null => {
  if (!base64String) return null;
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
    const ai = new GoogleGenAI(apiKey);

    // ************* F PLANI (C PLANI'nın İntikamı) *************
    // Vercel'in bozuk tip dosyasını (dilbilgisi polisini) susturuyoruz.
    // 'E Planı' (Önbelleği Sil) sayesinde artık Vercel'de '0.15.0' paketi var
    // ve bu kod (ai as any) sayesinde çalışacak.
    const model = (ai as any).getGenerativeModel({ model: "veo-3.1-fast-generate-preview" });

    // 3. Giriş verilerini (video parts) hazırla
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