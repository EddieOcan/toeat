import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { getScanHistory, type DisplayableHistoryProduct } from '../services/api';
import { useAuth } from './AuthContext';

type RecentProductsContextType = {
  recentProducts: DisplayableHistoryProduct[];
  scrollPosition: number;
  setScrollPosition: (position: number) => void;
  reloadRecentProducts: () => Promise<void>;
  loading: boolean;
};

const RecentProductsContext = createContext<RecentProductsContextType | undefined>(undefined);

export const RecentProductsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recentProducts, setRecentProducts] = useState<DisplayableHistoryProduct[]>([]);
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

  // Carica i prodotti recenti all'avvio o quando cambia l'utente
  useEffect(() => {
    reloadRecentProducts();
  }, [user, reloadRecentProducts]);

  return (
    <RecentProductsContext.Provider 
      value={{ 
        recentProducts, 
        scrollPosition, 
        setScrollPosition, 
        reloadRecentProducts,
        loading
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