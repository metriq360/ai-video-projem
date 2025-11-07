// "Mutfak" (Backend) Kodu
// VEO 3.1 çağrısını yapacak sunucusuz fonksiyon (app/api/video-olustur/route.ts)

// J PLANI: Vercel'in inatla görmediği getGenerativeModel fonksiyonunu, 
// paketi *tamamını* import ederek (import * as) görmeye zorluyoruz. 
// Artık bu, o 'intermediate value' hatasını gidermeli.

import * as gemini from '@google/genai'; // Paketin tamamını import et
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
    // ************* J PLANI *************
    // Paketin tamamını import ettiğimiz için burada 'gemini.GoogleGenAI' kullanıyoruz.
    const ai = new gemini.GoogleGenAI(apiKey);

    // Vercel'in bozuk tip dosyasını (dilbilgisi polisini) susturuyoruz.
    // Artık 'ai' değişkenine gerek yok, çünkü tüm paket 'gemini' adında.
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
        { category: gemini.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: gemini.HarmBlockThreshold.BLOCK_NONE },
        { category: gemini.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: gemini.HarmBlockThreshold.BLOCK_NONE },
        { category: gemini.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: gemini.HarmBlockThreshold.BLOCK_NONE },
        { category: gemini.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: gemini.HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    // 5. Cevabı (result) işle
    const videoData = result.response.candidates?.[0].content.parts
      .filter((part: any) => part.videoMetadata)
      .map((part: any) => part.videoMetadata?.videoUri);

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