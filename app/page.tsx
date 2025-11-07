"use client"; // ÇOK ÖNEMLİ: App Router'da 'useState' kullanmak için bu satır şart.

import React, { useState, useCallback } from 'react';

// --- İkonlar (Inline SVG) ---
// Yükleniyor İkonu
const LoaderIcon = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// Resim Yükleme İkonu
const UploadIcon = () => (
  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// --- Ana Uygulama Bileşeni ---
export default function AiVideoStudio() {
  // --- STATE YÖNETİMİ ---

  // API Anahtarı
  const [apiKey, setApiKey] = useState('');

  // Bölüm 1: Sahne Oluşturucu
  const [storyPrompt, setStoryPrompt] = useState('');
  const [scenePrompts, setScenePrompts] = useState([]);
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);
  const [fileContent, setFileContent] = useState(''); // Yüklenen dosya içeriği

  // Bölüm 2: Video Oluşturucu
  const [mainVideoPrompt, setMainVideoPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [base64Image, setBase64Image] = useState(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState(null);

  // --- BÖLÜM 1 FONKSİYONLARI (Sahne Oluşturma - Tarayıcıdan) ---

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileContent(e.target.result);
      };
      reader.readAsText(file);
    }
  };

  // JSON şeması Gemini API'sine bildiriliyor
  const sceneGenerationSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        prompt: { type: "STRING" },
        duration_seconds: { type: "NUMBER" }
      },
      required: ["prompt", "duration_seconds"]
    }
  };

  // ************* DÜZELTİLMİŞ FONKSİYON *************
  const handleGenerateScenes = async () => {
    // 'if' blokları düzeltildi
    if (!apiKey) {
      setVideoError('Lütfen önce Google AI API Anahtarınızı girin.');
      return;
    }
    if (!storyPrompt) {
      setVideoError('Lütfen bir hikaye metni girin.');
      return;
    }

    setIsLoadingScenes(true);
    setScenePrompts([]);
    setVideoError(null);

    // 'generativelangugage' -> 'generativelanguage' olarak düzeltildi
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // Sistem talimatı ile prompt'u güçlendirme
    const systemInstruction = {
      role: "model",
      parts: [{
        text: `Sen bir video kurgu asistanısın. Kullanıcının sağladığı hikayeyi ve (varsa) firma bilgilerini analiz et. Bu hikayeyi, her biri "prompt" ve "duration_seconds" (tavsiye edilen süre) içeren JSON nesnelerinden oluşan bir diziye ayır. Çıktı, doğrudan JSON formatında olmalı. Firma Bilgileri: ${fileContent || 'Yok'}`
      }]
    };
    
    const userPrompt = {
      role: "user",
      parts: [{ text: `Hikaye: ${storyPrompt}` }]
    };

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [systemInstruction, userPrompt],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: sceneGenerationSchema,
          },
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Hatası: ${errorData.error.message}`);
      }

      const data = await response.json();
      const jsonText = data.candidates[0].content.parts[0].text;
      const parsedScenes = JSON.parse(jsonText);
      setScenePrompts(parsedScenes);

    } catch (error) {
      console.error('Sahne oluşturma hatası:', error);
      setVideoError(`Sahne oluşturulurken bir hata oluştu: ${error.message}`);
    } finally {
      setIsLoadingScenes(false);
    }
  };
  // ************* DÜZELTME BİTTİ *************

  const handleUsePrompt = (prompt) => {
    setMainVideoPrompt(prompt);
  };

  // --- BÖLÜM 2 FONKSİYONLARI (Video Oluşturma - Sunucuya) ---

  const handleStyleClick = (style) => {
    setMainVideoPrompt(prev => `${prev} ${style}`.trim());
  };

  const handleImageUpload = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBase64Image(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageUpload(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ************* DÜZELTİLMİŞ FONKSİYON *************
  const handleGenerateVideo = async () => {
    // 'if' blokları düzeltildi
    if (!apiKey) {
      setVideoError('Lütfen önce Google AI API Anahtarınızı girin.');
      return;
    }
    if (!mainVideoPrompt) {
      setVideoError('Lütfen video oluşturmak için bir metin girin.');
      return;
    }

    setIsLoadingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoError(null);

    // Sunucusuz fonksiyonun yolu (Next.js App Router için doğru)
    const SERVERLESS_FUNCTION_URL = '/api/video-olustur'; 

    try {
      const response = await fetch(SERVERLESS_FUNCTION_URL, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: apiKey, // API anahtarını sunucuya güvenli bir şekilde gönderiyoruz
          prompt: mainVideoPrompt,
          aspectRatio: aspectRatio,
          base64Image: base64Image,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sunucu hatası');
      }

      const data = await response.json();
      setGeneratedVideoUrl(data.videoUrl);

    } catch (error) {
      console.error('Video oluşturma hatası:', error);
      setVideoError(`Video oluşturulurken bir hata oluştu: ${error.message}. Sunucu loglarını kontrol edin.`);
    } finally {
      setIsLoadingVideo(false);
    }
  };
  // ************* DÜZELTME BİTTİ *************
  
  // --- STIL BUTONLARI ---
  const styleButtons = [
    "+sinematik", "+yüksek kaliteli", "+hipergerçekçi", "+anime",
    "+vlog", "+drone çekimi", "+yakın çekim", "+ağır çekim", "+hızlandırılmış"
  ];

  // --- RENDER (JSX) ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Başlık ve API Anahtarı Alanı */}
        <header className="mb-8 p-6 bg-gray-800 rounded-lg shadow-lg">
          <h1 className="text-3xl md:text-4xl font-bold text-center text-indigo-400 mb-4">
            Yapay Zeka Yaratıcı Stüdyo (VEO 3.1)
          </h1>
          <div className="max-w-md mx-auto">
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-300 mb-1">
              Google AI API Anahtarınız
            </label>
            <input
              type="password"
              id="api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API anahtarınızı buraya yapıştırın..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </header>

        {/* Ana İçerik Alanı (İki Bölüm) */}
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* --- BÖLÜM 1: SAHNE OLUŞTURUCU --- */}
          <section className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-indigo-300 border-b border-gray-700 pb-2">
              Bölüm 1: Hikayeden Sahne Oluşturucu (Gemini 2.5)
            </h2>

            {/* Dosya Yükleme */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Firma Bilgileri Yükle (İsteğe bağlı .txt, .md)
              </label>
              <input
                type="file"
                accept=".txt,.md,.json"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
              />
            </div>
            
            {/* Hikaye Metni */}
            <div className="mb-4 flex-grow flex flex-col">
              <label htmlFor="story-prompt" className="block text-sm font-medium text-gray-300 mb-1">
                Hikaye Metni
              </label>
              <textarea
                id="story-prompt"
                rows="6"
                value={storyPrompt}
                onChange={(e) => setStoryPrompt(e.target.value)}
                placeholder="Örn., Yalnız bir astronot Mars'ta parlayan bir kristal keşfeder..."
                className="w-full flex-grow px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            
            {/* Buton */}
            <button
              onClick={handleGenerateScenes}
              disabled={isLoadingScenes || !apiKey}
              className="w-full flex justify-center items-center px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingScenes ? <LoaderIcon /> : null}
              {isLoadingScenes ? 'Oluşturuluyor...' : 'Sahne Metinleri Oluştur'}
            </button>

            {/* Sonuçlar */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Oluşturulan Sahneler:</h3>
              {scenePrompts.length > 0 ? (
                <ul className="max-h-60 overflow-y-auto space-y-3 bg-gray-700 p-4 rounded-md">
                  {scenePrompts.map((scene, index) => (
                    <li key={index} className="p-3 bg-gray-600 rounded-md shadow-sm">
                      <p className="text-sm text-gray-200">
                        <strong className="text-indigo-300">Sahne {index + 1} ({scene.duration_seconds}s):</strong> {scene.prompt}
                      </p>
                      <button
                        onClick={() => handleUsePrompt(scene.prompt)}
                        className="mt-2 px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        Bu metni kullan
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">
                  {isLoadingScenes ? 'Sahneler yükleniyor...' : 'Henüz sahne oluşturulmadı.'}
                </p>
              )}
            </div>
          </section>

          {/* --- BÖLÜM 2: VİDEO OLUŞTURUCU --- */}
          <section className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold mb-4 text-green-300 border-b border-gray-700 pb-2">
              Bölüm 2: Video Oluşturucu (VEO 3.1)
            </h2>

            {/* Ana Metin Kutusu */}
            <div className="mb-4">
              <label htmlFor="main-prompt" className="block text-sm font-medium text-gray-300 mb-1">
                Ana Video Metni (Prompt)
              </label>
              <textarea
                id="main-prompt"
                rows="6"
                value={mainVideoPrompt}
                onChange={(e) => setMainVideoPrompt(e.target.value)}
                placeholder="Oluşturmak istediğiniz videoyu detaylıca tarif edin..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Stil Butonları */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Hızlı Stiller:
              </label>
              <div className="flex flex-wrap gap-2">
                {styleButtons.map(style => (
                  <button
                    key={style}
                    onClick={() => handleStyleClick(style)}
                    className="px-2 py-1 bg-gray-600 text-gray-200 text-xs rounded-full hover:bg-gray-500"
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Seçenekler (En-Boy Oranı) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                En-Boy Oranı
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setAspectRatio('16:9')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${aspectRatio === '16:9' ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                >
                  16:9 (Yatay)
                </button>
                <button
                  onClick={() => setAspectRatio('9:16')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${aspectRatio === '9:16' ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                >
                  9:16 (Dikey)
                </button>
              </div>
            </div>
            
            {/* Görsel Yükleme */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Başlangıç Görseli (Image-to-Video - İsteğe bağlı)
              </label>
              <div 
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md cursor-pointer"
                onClick={() => document.getElementById('file-upload').click()}
              >
                {base64Image ? (
                  <img src={base64Image} alt="Yüklenen görsel" className="h-24 w-auto rounded-md" />
                ) : (
                  <div className="space-y-1 text-center">
                    <UploadIcon />
                    <div className="flex text-sm text-gray-400">
                      <p className="pl-1">Görsel sürükleyin veya seçmek için tıklayın</p>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={(e) => handleImageUpload(e.target.files[0])} />
                    </div>
                    <p className="text-xs text-gray-500">
                      PNG, JPG, WEBP
                    </p>
                  </div>
                )}
              </div>
              {base64Image && (
                <button
                  onClick={() => setBase64Image(null)}
                  className="mt-2 text-xs text-red-400 hover:text-red-300"
                >
                  Görseli Kaldır
                </button>
              )}
            </div>

            {/* Ana Oluşturma Butonu */}
            <button
              onClick={handleGenerateVideo}
              disabled={isLoadingVideo || !apiKey}
              className="w-full flex justify-center items-center px-4 py-3 bg-green-600 text-white font-semibold rounded-md shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingVideo ? <LoaderIcon /> : null}
              {isLoadingVideo ? 'Video Oluşturuluyor (Bu işlem sürebilir)...' : 'Video Oluştur'}
            </button>
            
            {/* Video Sonucu */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Oluşturulan Video:</h3>
              {isLoadingVideo && (
                <div className="flex flex-col items-center justify-center p-6 bg-gray-700 rounded-md">
                  <LoaderIcon />
                  <p className="mt-2 text-sm text-gray-300">Video oluşturuluyor... Lütfen bekleyin.</p>
                  <p className="text-xs text-gray-400">VEO 3.1 video üretimi birkaç dakika sürebilir.</p>
                </div>
              )}
              {videoError && (
                <div className="p-4 bg-red-800 text-red-100 rounded-md">
                  <p className="font-bold">Hata:</p>
                  <p className="text-sm">{videoError}</p>
                </div>
              )}
              {generatedVideoUrl && !isLoadingVideo && (
                <div className="space-y-4">
                  <video
                    controls
                    src={generatedVideoUrl}
                    className="w-full rounded-lg shadow-lg bg-black"
                  />
                  <a
                    href={generatedVideoUrl}
                    download="ai_video.mp4"
                    className="w-full block text-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                  >
                    Videoyu İndir
                  </a>
                </div>
              )}
            </div>
            
          </section>
        </main>
      </div>
    </div>
  );
}