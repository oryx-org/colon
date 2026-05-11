/**
 * useAnimationState — Manages all LLM block animation and Manim video state.
 *
 * Extracted from App.tsx to reduce root component complexity.
 * Handles: animation generation, loading, deletion, clearing,
 * Manim video generation, cancellation, deletion, engine status.
 */
import { useState, useEffect, useCallback } from 'react';
import type { AnimationRecord } from '../components/AnimationTab/AnimationTab';
import type { OpenFile } from '../App';

export function useAnimationState(
  activeFilePath: string | null,
  openFiles: OpenFile[],
  activeFileRef: React.MutableRefObject<OpenFile | null>,
  saveActiveFile: () => Promise<void>,
  setRightTab: (tab: string) => void,
  rightTab: string,
) {
  // LLM Animation system state — keyed by file path to prevent cross-file collision
  const [animsByFile, setAnimsByFile] = useState<Record<string, AnimationRecord[]>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [animError, setAnimError] = useState<string | null>(null);

  // Manim video state — keyed by file path
  const [manimVideosByFile, setManimVideosByFile] = useState<Record<string, any[]>>({});
  const [isManimRendering, setIsManimRendering] = useState(false);
  const [manimError, setManimError] = useState<string | null>(null);
  const [animEngineInstalled, setAnimEngineInstalled] = useState(false);

  // Derive current file's data
  const animations = activeFilePath ? (animsByFile[activeFilePath] || []) : [];
  const manimVideos = activeFilePath ? (manimVideosByFile[activeFilePath] || []) : [];

  // Check LLM + animation engine status on startup
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    if (api.animation?.getLlmStatus) {
      api.animation.getLlmStatus().then((status: any) => {
        setLlmConfigured(status?.configured || false);
        console.log('[useAnimationState] LLM status:', status);
        return undefined;
      }).catch((err: any) => console.error('[useAnimationState] Failed to get LLM status:', err));
    }

    if (api.animEngine?.check) {
      api.animEngine.check().then((status: any) => {
        setAnimEngineInstalled(status?.installed || false);
        return undefined;
      }).catch((err: any) => console.error('[useAnimationState] Failed to check anim engine:', err));
    }
  }, []);

  // Refresh animation engine status when opening the animation tab
  useEffect(() => {
    if (rightTab === 'video') {
      const api = (window as any).electronAPI;
      if (api?.animEngine?.check) {
        api.animEngine.check().then((status: any) => {
          setAnimEngineInstalled(status?.installed || false);
          return undefined;
        }).catch((err: any) => console.error('[useAnimationState] Failed to check anim engine:', err));
      }
    }
  }, [rightTab]);

  // Load saved animations when active file changes
  useEffect(() => {
    if (!activeFilePath) return;
    if (animsByFile[activeFilePath]) return;

    const api = (window as any).electronAPI;
    if (!api?.animation?.loadAnimations) return;

    api.animation.loadAnimations(activeFilePath).then((result: any) => {
      if (result.success) {
        setAnimsByFile(prev => ({ ...prev, [activeFilePath]: result.animations || [] }));
      } else {
        setAnimsByFile(prev => ({ ...prev, [activeFilePath]: [] }));
      }
      return undefined;
    }).catch(() => {
      setAnimsByFile(prev => ({ ...prev, [activeFilePath]: [] }));
    });
  }, [activeFilePath]);

  // Load Manim videos when active file changes
  useEffect(() => {
    if (!activeFilePath) return;
    if (manimVideosByFile[activeFilePath]) return;

    const api = (window as any).electronAPI;
    if (!api?.manim?.loadVideos) return;

    api.manim.loadVideos(activeFilePath).then((result: any) => {
      if (result.success) {
        setManimVideosByFile(prev => ({ ...prev, [activeFilePath]: result.videos || [] }));
      }
      return undefined;
    }).catch(() => {});
  }, [activeFilePath]);

  // Generate animation for a code block
  const handleGenerateAnimation = useCallback(async (filePath: string, code: string, language: string, blockInfo: any) => {
    const api = (window as any).electronAPI;
    if (!api?.animation?.generateAnimation || isGenerating) return;

    const file = openFiles.find(f => f.path === filePath);
    if (file?.isDirty) await saveActiveFile();

    setIsGenerating(true);
    setAnimError(null);
    setRightTab('video');
    try {
      const result = await api.animation.generateAnimation(filePath, code, language, blockInfo);
      if (result.success && result.record) {
        setAnimsByFile(prev => ({
          ...prev,
          [filePath]: [...(prev[filePath] || []), result.record]
        }));
      } else {
        setAnimError(result.error || 'Animation generation failed');
        console.error('[useAnimationState] Animation generation failed:', result.error);
      }
    } catch (err: any) {
      setAnimError(err.message || 'Unknown error');
      console.error('[useAnimationState] Animation error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, openFiles, saveActiveFile, setRightTab]);

  const handleCancelAnimation = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (api?.animation?.cancel) {
      await api.animation.cancel();
      setIsGenerating(false);
      setAnimError("Animation generation stopped by user.");
    }
  }, []);

  const handleDeleteAnimation = useCallback(async (animId: string) => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.animation?.deleteAnimation || !file) return;

    await api.animation.deleteAnimation(file.path, animId);
    setAnimsByFile(prev => ({
      ...prev,
      [file.path]: (prev[file.path] || []).filter(a => a.id !== animId)
    }));
  }, [activeFileRef]);

  const handleClearAnimations = useCallback(async () => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.animation?.clearAnimations || !file) return;

    await api.animation.clearAnimations(file.path);
    setAnimsByFile(prev => ({ ...prev, [file.path]: [] }));
  }, [activeFileRef]);

  // Manim video generation
  const handleGenerateManimVideo = useCallback(async () => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.manim?.generate || !file || isManimRendering) return;

    if (file.isDirty) await saveActiveFile();

    setIsManimRendering(true);
    setManimError(null);
    setRightTab('video');
    try {
      const result = await api.manim.generate(file.path, file.content, file.language);
      if (result.success && result.record) {
        setManimVideosByFile(prev => ({
          ...prev,
          [file.path]: [...(prev[file.path] || []), result.record]
        }));
      } else {
        setManimError(result.error || 'Video generation failed');
      }
    } catch (err: any) {
      setManimError(err.message || 'Unknown error');
    } finally {
      setIsManimRendering(false);
    }
  }, [isManimRendering, activeFileRef, saveActiveFile, setRightTab]);

  const handleCancelManimVideo = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (api?.manim?.cancel) {
      await api.manim.cancel();
      setIsManimRendering(false);
      setManimError("Video generation stopped by user.");
    }
  }, []);

  const handleDeleteManimVideo = useCallback(async (videoId: string) => {
    const api = (window as any).electronAPI;
    const file = activeFileRef.current;
    if (!api?.manim?.deleteVideo || !file) return;

    await api.manim.deleteVideo(file.path, videoId);
    setManimVideosByFile(prev => ({
      ...prev,
      [file.path]: (prev[file.path] || []).filter((v: any) => v.id !== videoId)
    }));
  }, [activeFileRef]);

  return {
    animations,
    manimVideos,
    isGenerating,
    llmConfigured,
    animError,
    isManimRendering,
    manimError,
    animEngineInstalled,
    handleGenerateAnimation,
    handleCancelAnimation,
    handleDeleteAnimation,
    handleClearAnimations,
    handleGenerateManimVideo,
    handleCancelManimVideo,
    handleDeleteManimVideo,
  };
}
