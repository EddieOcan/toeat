import React, { createContext, useState, useContext, useCallback } from 'react';
import type { GeminiAnalysisResult } from '../services/gemini';
import type { RawProductData } from '../services/api';

type PhotoAnalysisUpdate = {
  productRecordId: string;
  productData?: RawProductData;
  aiAnalysisResult?: GeminiAnalysisResult;
  isComplete?: boolean;
};

type PhotoAnalysisContextType = {
  currentAnalysis: PhotoAnalysisUpdate | null;
  updateAnalysis: (update: PhotoAnalysisUpdate) => void;
  clearAnalysis: () => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;
};

const PhotoAnalysisContext = createContext<PhotoAnalysisContextType | undefined>(undefined);

export const PhotoAnalysisProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentAnalysis, setCurrentAnalysis] = useState<PhotoAnalysisUpdate | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const updateAnalysis = useCallback((update: PhotoAnalysisUpdate) => {
    console.log('[PHOTO ANALYSIS CONTEXT] Aggiornamento analisi:', update);
    setCurrentAnalysis(prev => {
      if (!prev || prev.productRecordId !== update.productRecordId) {
        return update;
      }
      // Merge degli aggiornamenti per lo stesso prodotto
      return {
        ...prev,
        ...update,
        productData: update.productData || prev.productData,
        aiAnalysisResult: update.aiAnalysisResult || prev.aiAnalysisResult,
      };
    });
  }, []);

  const clearAnalysis = useCallback(() => {
    console.log('[PHOTO ANALYSIS CONTEXT] Clearing analisi');
    setCurrentAnalysis(null);
    setIsAnalyzing(false);
  }, []);

  return (
    <PhotoAnalysisContext.Provider value={{
      currentAnalysis,
      updateAnalysis,
      clearAnalysis,
      isAnalyzing,
      setIsAnalyzing,
    }}>
      {children}
    </PhotoAnalysisContext.Provider>
  );
};

export const usePhotoAnalysis = () => {
  const context = useContext(PhotoAnalysisContext);
  if (context === undefined) {
    throw new Error('usePhotoAnalysis must be used within a PhotoAnalysisProvider');
  }
  return context;
}; 