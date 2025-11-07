"use client";

import React, { useState, useCallback } from 'react';

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

export default function AiVideoStudio() {
  const [apiKey, setApiKey] = useState('');
  const [storyPrompt, setStoryPrompt] = useState('');
  const [scenePrompts, setScenePrompts] = useState<{ prompt: string; duration_seconds: number }[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<number[]>([]);
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);
  const [fileContent, setFileContent] = useState('');
  const [totalDuration, setTotalDuration] = useState('30');
  const [mainVideoPrompt, setMainVideoPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setFileContent(e.target?.result as string);
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
        text: `Sen bir video kurgu asistanısın. Kullanıcının sağladığı hikayeyi analiz et. Toplam ${totalDuration} saniyelik sahnelere böl, her biri "prompt" ve "duration_seconds" içersin. Çıktı saf JSON olmalı. Firma Bilgileri: ${fileContent || 'Yok'}.`
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
        }),
      });

      if (!response.ok) throw new Error("Gemini API hatası.");

      const data = await response.json();
      const jsonText = data.candidates[0].content.parts[0].text;
      const parsedScenes = JSON.parse(jsonText);
      setScenePrompts(parsedScenes);
    } catch (error) {
      console.error("Sahne oluşturma hatası:", error);
      setVideoError(`Sahne oluşturulurken hata: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingScenes(false);
    }
  };

  const handleSceneSelection = (index: number) => {
    setSelectedScenes(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  };

  const handleSelectAllScenes = () => setSelectedScenes(scenePrompts.map((_, i) => i));
  const handleDeselectAllScenes = () => setSelectedScenes([]);

  const handleCombineAndUseScenes = () => {
    const selectedIndices = [...selectedScenes].sort((a, b) => a - b);
    const scenesToCombine = selectedIndices.map(i => scenePrompts[i]);
    if (!scenesToCombine.length) {
      setVideoError("Lütfen en az bir sahne seç.");
      return;
    }
    const combinedPrompt = scenesToCombine
      .map((s, i) => `Sahne ${i + 1} (${s.duration_seconds}s): ${s.prompt}`)
      .join("\n\n");
    setMainVideoPrompt(combinedPrompt);
    setVideoError(null);
  };

  const handleImageUpload = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => setBase64Image(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) {
      handleImageUpload(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleGenerateVideo = async () => {
    if (!apiKey) {
      setVideoError("Lütfen önce Google AI API Anahtarınızı girin.");
      return;
    }
    if (!mainVideoPrompt) {
      setVideoError("Lütfen video oluşturmak için bir metin girin.");
      return;
    }

    setIsLoadingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoError(null);

    const SERVERLESS_FUNCTION_URL = "/api/video-olustur";

    try {
      const response = await fetch(SERVERLESS_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          prompt: mainVideoPrompt,
          aspectRatio,
          base64Image,
        }),
      });

      let data = null;
      try {
        data = await response.json(); // ✅ sadece 1 kez parse
      } catch (jsonErr) {
        console.warn("Yanıt JSON değil:", jsonErr);
      }

      if (!response.ok) throw new Error(data?.error || `Sunucu hatası (${response.status})`);
      if (!data?.videoUrl) throw new Error("Sunucudan geçerli video URL'si dönmedi.");

      setGeneratedVideoUrl(data.videoUrl);
    } catch (error) {
      console.error("Video oluşturma hatası:", error);
      setVideoError(`Video oluşturulurken hata: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingVideo(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 p-6 bg-gray-800 rounded-lg shadow-lg">
          <h1 className="text-3xl font-bold text-center text-indigo-400 mb-4">
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
              placeholder="API anahtarınızı girin..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100"
            />
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Bölüm 1 ve Bölüm 2 bileşenleri — aynı kalabilir */}
          {/* ... senin orijinal JSX yapın buraya kalacak ... */}
        </main>
      </div>
    </div>
  );
}
