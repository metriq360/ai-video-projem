"use client";

import React, { useState, useCallback } from 'react';

// --- İkonlar (Inline SVG) ---
const LoaderIcon = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

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
  type Scene = {
    prompt: string;
    duration_seconds: number;
  };
  const [scenePrompts, setScenePrompts] = useState<Scene[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<number[]>([];

  const [isLoadingScenes, setIsLoadingScenes] = useState(false);
  const [fileContent, setFileContent] = useState('');
  const [totalDuration, setTotalDuration] = useState('30');

  // Bölüm 2: Video Oluşturucu
  const [mainVideoPrompt, setMainVideoPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // --- BÖLÜM 1 FONKSİYONLARI ---
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileContent(e.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

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

  const safeParseJson = async (res: Response) => {
    const text = await res.text();
    try {
      return { ok: true, json: JSON.parse(text) };
    } catch (e) {
      return { ok: false, text };
    }
  };

  const handleGenerateScenes = async () => {
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
    setSelectedScenes([]);
    setVideoError(null);

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const systemInstruction = {
      role: "model",
      parts: [{
        text: `Sen bir video kurgu asistanısın. Kullanıcının sağladığı hikayeyi ve (varsa) firma bilgilerini analiz et. Kullanıcı, toplamda YAKLAŞIK ${totalDuration || '30'} saniyelik bir video istiyor. Bu hikayeyi, bu toplam süreye UYGUN BİR ŞEKİLDE, her biri "prompt" ve "duration_seconds" içeren JSON nesnelerinden oluşan bir diziye ayır. Sahnelerin toplam süresi ${totalDuration || '30'} saniyeyi çok geçmemeli. Çıktı, doğrudan JSON formatında olmalı. Firma Bilgileri: ${fileContent || 'Yok'}`
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

      const parsed = await safeParseJson(response);

      if (!response.ok) {
        const message = parsed.ok ? (parsed.json?.error?.message || JSON.stringify(parsed.json)) : parsed.text;
        throw new Error(`API Hatası: ${message}`);
      }

      if (!parsed.ok) {
        throw new Error(`API yanıtı JSON değildi: ${String(parsed.text).slice(0, 300)}`);
      }

      const data = parsed.json;
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) throw new Error("Gemini yanıtı beklenen alanda metin döndürmedi.");

      let parsedScenes;
      try {
        parsedScenes = JSON.parse(candidateText);
      } catch (e) {
        throw new Error("Gemini'den dönen metin JSON değil veya doğru formatta değil.");
      }

      if (!Array.isArray(parsedScenes)) throw new Error("Sahneler dizi formatında dönmedi.");
      setScenePrompts(parsedScenes);

    } catch (error) {
      console.error('Sahne oluşturma hatası:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setVideoError(`Sahne oluşturulurken bir hata oluştu: ${errorMessage}`);
    } finally {
      setIsLoadingScenes(false);
    }
  };

  const handleUsePrompt = (prompt: string) => {
    setMainVideoPrompt(prompt);
  };

  const handleSceneSelection = (index: number) => {
    setSelectedScenes(prevSelected => {
      if (prevSelected.includes(index)) {
        return prevSelected.filter(i => i !== index);
      } else {
        return [...prevSelected, index];
      }
    });
  };

  const handleSelectAllScenes = () => {
    setSelectedScenes(scenePrompts.map((_, index) => index));
  };

  const handleDeselectAllScenes = () => {
    setSelectedScenes([]);
  };

  const handleCombineAndUseScenes = () => {
    const selectedIndicesInOrder = [...selectedScenes].sort((a, b) => a - b);
    const scenesToCombine = selectedIndicesInOrder.map(index => scenePrompts[index]);

    if (scenesToCombine.length === 0) {
      setVideoError("Lütfen birleştirmek için en az bir sahne seçin.");
      return;
    }

    const combinedPrompt = scenesToCombine
      .map((scene, index) => `Sahne ${index + 1} (${scene.duration_seconds}s): ${scene.prompt}`)
      .join("\n\n");

    setMainVideoPrompt(combinedPrompt);
    setVideoError(null);
  };

  // --- BÖLÜM 2 FONKSİYONLARI (Video Oluşturma) ---

  const handleStyleClick = (style: string) => {
    setMainVideoPrompt(prev => `${prev} ${style}`.trim());
  };

  const handleImageUpload = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBase64Image(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageUpload(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // --- GÜNCELLEDİĞİMİZ FONKSİYON ---
  const handleGenerateVideo = async () => {
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

    const SERVERLESS_FUNCTION_URL = '/api/video-olustur';

    try {
      const response = await fetch(SERVERLESS_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: mainVideoPrompt, // sadece prompt yeterli
        }),
      });

      const parsed = await (async () => {
        const text = await response.text();
        try {
          return { ok: true, json: JSON.parse(text) };
        } catch (e) {
          return { ok: false, text };
        }
      })();

      if (!response.ok) {
        const msg = parsed.ok ? (parsed.json?.error || JSON.stringify(parsed.json)) : parsed.text;
        throw new Error(msg || `Sunucu hatası (${response.status})`);
      }

      if (!parsed.ok) {
        throw new Error("Sunucudan geçerli JSON yanıtı alınamadı.");
      }

      const data = parsed.json;

      // VEO3, operationName döner
      const operationName = data?.operationName;

      if (!operationName) {
        throw new Error("OperationName alınamadı.");
      }

      // operationName ile videoyu kontrol etmek için pollVideoStatus fonksiyonunu çağır
      await pollVideoStatus(operationName);

    } catch (error) {
      console.error('Video oluşturma hatası:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setVideoError(`Video oluşturulurken bir hata oluştu: ${errorMessage}.`);
    } finally {
      setIsLoadingVideo(false);
    }
  };

  // --- POLL VIDEO FONKSİYONU ---
  const pollVideoStatus = async (operationName) => {
    let done = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 saniye * 2 saniyede bir = 60 saniye

    while (!done && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 saniye bekle

      const res = await fetch(`/api/poll-video?operationName=${operationName}`);
      const data = await res.json();

      if (data.done) {
        done = true;
        if (data.videoUrl) {
          setGeneratedVideoUrl(data.videoUrl);
          setVideoError(null);
        } else {
          setVideoError("Video oluşturulamadı.");
        }
        break;
      }
    }

    if (!done) {
      setVideoError("Video zaman aşımına uğradı.");
    }
  };

  // --- STIL KARTLARI ---
  const styleCards = [
    { name: "+sinematik", label: "Sinematik", image: "https://placehold.co/150x100/1E293B/93C5FD?text=Sinematik" },
    { name: "+hipergerçekçi", label: "Hipergerçekçi", image: "https://placehold.co/150x100/334155/E0E7FF?text=Hiperger%C3%A7ek%C3%A7i" },
    { name: "+anime", label: "Anime", image: "https://placehold.co/150x100/4C1D95/F5D0FE?text=Anime" },
    { name: "+vlog", label: "Vlog", image: "https://placehold.co/150x100/15803D/BBF7D0?text=Vlog" },
    { name: "+drone çekimi", label: "Drone Çekimi", image: "https://placehold.co/150x100/0C4A6E/BAE6FD?text=Drone" },
    { name: "+ağır çekim", label: "Ağır Çekim", image: "https://placehold.co/150x100/7F1D1D/FECACA?text=A%C4%9F%C4%B1r+%C3%87ekim" },
    { name: "+yakın çekim", label: "Yakın Çekim", image: "https://placehold.co/150x100/431407/FED7AA?text=Yak%C4%B1n+%C3%87ekim" }
  ];

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
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

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* --- BÖLÜM 1: SAHNE OLUŞTURUCU --- */}
          <section className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-indigo-300 border-b border-gray-700 pb-2">
              Bölüm 1: Hikayeden Sahne Oluşturucu (Gemini 2.5)
            </h2>

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

            <div className="mb-4">
              <label htmlFor="total-duration" className="block text-sm font-medium text-gray-300 mb-1">
                İstenen Toplam Süre (saniye)
              </label>
              <input
                type="number"
                id="total-duration"
                value={totalDuration}
                onChange={(e) => setTotalDuration(e.target.value)}
                placeholder="Örn., 30"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="mb-4 flex-grow flex flex-col">
              <label htmlFor="story-prompt" className="block text-sm font-medium text-gray-300 mb-1">
                Hikaye Metni
              </label>
              <textarea
                id="story-prompt"
                rows={6}
                value={storyPrompt}
                onChange={(e) => setStoryPrompt(e.target.value)}
                placeholder="Örn., Yalnız bir astronot Mars'ta parlayan bir kristal keşfeder..."
                className="w-full flex-grow px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleGenerateScenes}
              disabled={isLoadingScenes || !apiKey}
              className="w-full flex justify-center items-center px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingScenes ? <LoaderIcon /> : null}
              {isLoadingScenes ? 'Oluşturuluyor...' : 'Sahne Metinleri Oluştur'}
            </button>

            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Oluşturulan Sahneler:</h3>
              {scenePrompts.length > 0 ? (
                <>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-300">
                      {selectedScenes.length} / {scenePrompts.length} sahne seçili
                    </p>
                    <div className="space-x-2">
                      <button
                        onClick={handleSelectAllScenes}
                        className="px-2 py-1 text-xs font-medium bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500"
                      >
                        Tümünü Seç
                      </button>
                      <button
                        onClick={handleDeselectAllScenes}
                        className="px-2 py-1 text-xs font-medium bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500"
                      >
                        Seçimi Bırak
                      </button>
                    </div>
                  </div>

                  <ul className="max-h-60 overflow-y-auto space-y-3 bg-gray-700 p-4 rounded-md">
                    {scenePrompts.map((scene, index) => (
                      <li
                        key={index}
                        className={`p-3 bg-gray-600 rounded-md shadow-sm transition-all ${selectedScenes.includes(index) ? 'ring-2 ring-green-500' : ''}`}
                      >
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            id={`scene-${index}`}
                            checked={selectedScenes.includes(index)}
                            onChange={() => handleSceneSelection(index)}
                            className="mt-1 h-4 w-4 text-green-600 bg-gray-700 border-gray-500 rounded focus:ring-green-500"
                          />
                          <label htmlFor={`scene-${index}`} className="ml-3 block w-full">
                            <p className="text-sm text-gray-200">
                              <strong className="text-indigo-300">Sahne {index + 1} ({scene.duration_seconds}s):</strong> {scene.prompt}
                            </p>
                          </label>
                        </div>
                        <button
                          onClick={() => handleUsePrompt(scene.prompt)}
                          className="mt-2 ml-7 px-3 py-1 text-xs font-medium bg-gray-700 text-gray-300 rounded-md hover:bg-gray-500"
                        >
                          Sadece Bu Metni Kullan (Hızlı Test)
                        </button>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={handleCombineAndUseScenes}
                    disabled={selectedScenes.length === 0}
                    className="w-full mt-4 px-4 py-2 bg-green-700 text-white font-semibold rounded-md shadow-md hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Seçilen ({selectedScenes.length}) Sahneyi Birleştir ve Bölüm 2'ye Gönder
                  </button>
                </>
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

            <div className="mb-4">
              <label htmlFor="main-prompt" className="block text-sm font-medium text-gray-300 mb-1">
                Ana Video Metni (Prompt)
              </label>
              <textarea
                id="main-prompt"
                rows={6}
                value={mainVideoPrompt}
                onChange={(e) => setMainVideoPrompt(e.target.value)}
                placeholder="Oluşturmak istediğiniz videoyu detaylıca tarif edin..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Hızlı Stiller (Görselli)
              </label>
              <div className="flex overflow-x-auto space-x-4 pb-4">
                {styleCards.map((style) => (
                  <div
                    key={style.name}
                    onClick={() => handleStyleClick(style.name)}
                    className="flex-shrink-0 w-36 bg-gray-700 rounded-lg shadow-md overflow-hidden cursor-pointer transform transition-transform hover:scale-105"
                  >
                    <img
                      src={style.image}
                      alt={style.label}
                      className="w-full h-20 object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://placehold.co/150x100/7f1d1d/fee2e2?text=Resim+Hatasi'; }}
                    />
                    <div className="p-2">
                      <p className="text-xs font-medium text-center text-gray-200">{style.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Başlangıç Görseli (Image-to-Video - İsteğe bağlı)
              </label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md cursor-pointer"
                onClick={() => (document.getElementById('file-upload') as HTMLInputElement)?.click()}
              >
                {base64Image ? (
                  <img src={base64Image} alt="Yüklenen görsel" className="h-24 w-auto rounded-md" />
                ) : (
                  <div className="space-y-1 text-center">
                    <UploadIcon />
                    <div className="flex text-sm text-gray-400">
                      <p className="pl-1">Görsel sürükleyin veya seçmek için tıklayın</p>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])} />
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

            <button
              onClick={handleGenerateVideo}
              disabled={isLoadingVideo || !apiKey}
              className="w-full flex justify-center items-center px-4 py-3 bg-green-600 text-white font-semibold rounded-md shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingVideo ? <LoaderIcon /> : null}
              {isLoadingVideo ? 'Video Oluşturuluyor (Bu işlem sürebilir)...' : 'Video Oluştur'}
            </button>

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