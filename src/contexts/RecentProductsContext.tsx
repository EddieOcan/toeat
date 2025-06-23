import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { getScanHistory, type DisplayableHistoryProduct } from '../services/api';
import { useAuth } from './AuthContext';

// Tipo per prodotti in attesa (pending)
export interface PendingProduct {
  id: string; // temporary ID
  barcode: string;
  isLoading: boolean; // true = caricamento da OpenFoodFacts, false = pronto per analisi AI
  product_name?: string;
  brand?: string;
  product_image?: string;
  scanned_at: string;
  awaitingAiAnalysis: boolean; // true se il prodotto è pronto per l'analisi AI
}

type RecentProductsContextType = {
  recentProducts: DisplayableHistoryProduct[];
  pendingProducts: PendingProduct[];
  scrollPosition: number;
  setScrollPosition: (position: number) => void;
  reloadRecentProducts: () => Promise<void>;
  loading: boolean;
  // Nuove funzioni per gestire i prodotti pending
  addPendingProduct: (barcode: string) => string; // Ritorna l'ID temporaneo
  updatePendingProduct: (tempId: string, updates: Partial<PendingProduct>) => void;
  removePendingProduct: (tempId: string) => void;
};

const RecentProductsContext = createContext<RecentProductsContextType | undefined>(undefined);

export const RecentProductsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recentProducts, setRecentProducts] = useState<DisplayableHistoryProduct[]>([]);
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const reloadRecentProducts = useCallback(async () => {
    if (!user) { 
      setRecentProducts([]); 
      return; 
    }
    
    try {
      setLoading(true);
      const history = await getScanHistory(user.id);
      setRecentProducts(history);
    } catch (e) {
      console.error("[RECENTPRODUCTS CONTEXT ERROR] Errore caricando prodotti recenti:", e);
      setRecentProducts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Aggiunge un prodotto in attesa immediatamente dopo la scansione
  const addPendingProduct = useCallback((barcode: string): string => {
    const tempId = `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const pendingProduct: PendingProduct = {
      id: tempId,
      barcode,
      isLoading: true, // Sta caricando da OpenFoodFacts
      product_name: undefined,
      brand: undefined,
      product_image: undefined,
      scanned_at: new Date().toISOString(),
      awaitingAiAnalysis: false,
    };
    
    setPendingProducts(prev => [pendingProduct, ...prev]);
    console.log(`[PENDING] Aggiunto prodotto pending per barcode ${barcode} con ID ${tempId}`);
    return tempId;
  }, []);

  // Aggiorna un prodotto in attesa
  const updatePendingProduct = useCallback((tempId: string, updates: Partial<PendingProduct>) => {
    setPendingProducts(prev => 
      prev.map(product => 
        product.id === tempId 
          ? { ...product, ...updates }
          : product
      )
    );
    console.log(`[PENDING] Aggiornato prodotto pending ${tempId}:`, updates);
  }, []);

  // Rimuove un prodotto in attesa (quando viene completato e aggiunto ai recenti)
  const removePendingProduct = useCallback((tempId: string) => {
    setPendingProducts(prev => prev.filter(product => product.id !== tempId));
    console.log(`[PENDING] Rimosso prodotto pending ${tempId}`);
  }, []);

  // Carica i prodotti recenti all'avvio o quando cambia l'utente
  useEffect(() => {
    reloadRecentProducts();
  }, [user, reloadRecentProducts]);

  // Pulisci i prodotti pending quando l'utente cambia
  useEffect(() => {
    if (!user) {
      setPendingProducts([]);
    }
  }, [user]);

  return (
    <RecentProductsContext.Provider 
      value={{ 
        recentProducts, 
        pendingProducts,
        scrollPosition, 
        setScrollPosition, 
        reloadRecentProducts,
        loading,
        addPendingProduct,
        updatePendingProduct,
        removePendingProduct,
      }}
    >
      {children}
    </RecentProductsContext.Provider>
  );
};

export const useRecentProducts = () => {
  const context = useContext(RecentProductsContext);
  if (context === undefined) {
    throw new Error('useRecentProducts deve essere usato all\'interno di un RecentProductsProvider');
  }
  return context;
}; 