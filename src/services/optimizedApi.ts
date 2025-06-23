import { supabase } from "../lib/supabase";
import { ProductRecord } from "./api";

// Cache globale per le query frequenti
class QueryCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  
  set(key: string, data: any, ttl: number = 60000) { // TTL di default 1 minuto
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  invalidate(pattern?: string) {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    
    // Rimuovi le chiavi che corrispondono al pattern
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
  
  // Cleanup automatico delle voci scadute
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > value.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Istanza globale della cache
const queryCache = new QueryCache();

// Cleanup automatico ogni 5 minuti
setInterval(() => queryCache.cleanup(), 5 * 60 * 1000);

// Gestore per il batching delle query
class QueryBatcher {
  private batches = new Map<string, {
    queries: Array<{ resolve: Function; reject: Function; params: any }>;
    timeout: NodeJS.Timeout;
  }>();
  
  private BATCH_DELAY = 50; // 50ms di delay per il batching
  
  async batchQuery<T>(
    batchKey: string,
    queryFn: (params: any[]) => Promise<T[]>,
    params: any
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.batches.has(batchKey)) {
        this.batches.set(batchKey, {
          queries: [],
          timeout: setTimeout(() => this.executeBatch(batchKey, queryFn), this.BATCH_DELAY)
        });
      }
      
      const batch = this.batches.get(batchKey)!;
      batch.queries.push({ resolve, reject, params });
    });
  }
  
  private async executeBatch<T>(batchKey: string, queryFn: (params: any[]) => Promise<T[]>) {
    const batch = this.batches.get(batchKey);
    if (!batch) return;
    
    this.batches.delete(batchKey);
    
    try {
      const allParams = batch.queries.map(q => q.params);
      const results = await queryFn(allParams);
      
      // Risolvi tutte le promise con i rispettivi risultati
      batch.queries.forEach((query, index) => {
        query.resolve(results[index]);
      });
    } catch (error) {
      // Rigetta tutte le promise in caso di errore
      batch.queries.forEach(query => {
        query.reject(error);
      });
    }
  }
}

const queryBatcher = new QueryBatcher();

// Servizio ottimizzato per le operazioni sui prodotti
export class OptimizedProductService {
  
  // Ottimizzazione: Carica prodotto con caching intelligente
  static async getProductById(productId: string, useCache: boolean = true): Promise<ProductRecord | null> {
    const cacheKey = `product-${productId}`;
    
    if (useCache) {
      const cached = queryCache.get(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] Prodotto ${productId} dalla cache`);
        return cached;
      }
    }
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      
      if (error) throw error;
      
      // Cache per 2 minuti
      if (data) {
        queryCache.set(cacheKey, data, 120000);
      }
      
      return data;
    } catch (error) {
      console.error(`[API ERROR] Errore caricamento prodotto ${productId}:`, error);
      throw error;
    }
  }
  
  // Ottimizzazione: Verifica esistenza prodotto con query minimale
  static async checkProductExists(
    barcode: string, 
    userId: string, 
    useCache: boolean = true
  ): Promise<{ id: string; health_score?: number } | null> {
    const cacheKey = `product-check-${userId}-${barcode}`;
    
    if (useCache) {
      const cached = queryCache.get(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] Controllo esistenza prodotto ${barcode} dalla cache`);
        return cached;
      }
    }
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, health_score, product_name, brand') // Solo campi necessari
        .eq('barcode', barcode)
        .eq('user_id', userId)
        .eq('is_visually_analyzed', false)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      // Cache per 30 secondi (controlli di esistenza sono più volatili)
      queryCache.set(cacheKey, data, 30000);
      
      return data;
    } catch (error) {
      console.error(`[API ERROR] Errore controllo esistenza prodotto ${barcode}:`, error);
      throw error;
    }
  }
  
  // Ottimizzazione: Carica prodotti recenti con paginazione e caching
  static async getRecentProducts(
    userId: string,
    limit: number = 20,
    useCache: boolean = true
  ): Promise<ProductRecord[]> {
    const cacheKey = `recent-products-${userId}-${limit}`;
    
    if (useCache) {
      const cached = queryCache.get(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] Prodotti recenti per utente ${userId} dalla cache`);
        return cached;
      }
    }
    
    try {
             const { data, error } = await supabase
         .from('products')
         .select(`
           id, 
           user_id,
           product_name, 
           brand, 
           product_image, 
           health_score, 
           sustainability_score,
           barcode,
           is_visually_analyzed,
           calories_estimate,
           calorie_estimation_type,
           ingredients_breakdown,
           created_at,
           updated_at
         `) // Campi necessari per ProductRecord
         .eq('user_id', userId)
         .order('created_at', { ascending: false })
         .limit(limit);
      
      if (error) throw error;
      
      // Cache per 30 secondi (dati recenti cambiano frequentemente)
      queryCache.set(cacheKey, data || [], 30000);
      
      return data || [];
    } catch (error) {
      console.error(`[API ERROR] Errore caricamento prodotti recenti:`, error);
      throw error;
    }
  }
  
  // Ottimizzazione: Verifica stato preferiti con batching
  static async checkFavoriteStatus(userId: string, productId: string): Promise<boolean> {
    const cacheKey = `favorite-${userId}-${productId}`;
    
    const cached = queryCache.get(cacheKey);
    if (cached !== null) {
      console.log(`[CACHE HIT] Stato preferiti per ${productId} dalla cache`);
      return cached;
    }
    
    try {
      // Usa il batcher per ottimizzare multiple verifiche
      const result = await queryBatcher.batchQuery(
        `favorites-${userId}`,
        async (productIds: string[]) => {
          const { data, error } = await supabase
            .from('user_favorites')
            .select('product_record_id')
            .eq('user_id', userId)
            .in('product_record_id', productIds);
          
          if (error) throw error;
          
          // Restituisci array di boolean per ogni productId
          return productIds.map(id => 
            data?.some(fav => fav.product_record_id === id) || false
          );
        },
        productId
      );
      
      // Cache per 5 minuti
      queryCache.set(cacheKey, result, 300000);
      
      return result;
    } catch (error) {
      console.error(`[API ERROR] Errore verifica stato preferiti:`, error);
      return false;
    }
  }
  
  // Ottimizzazione: Invalida cache quando necessario
  static invalidateCache(pattern?: string) {
    queryCache.invalidate(pattern);
  }
  
  // Ottimizzazione: Preload dei dati correlati
  static async preloadRelatedData(userId: string, productId: string) {
    try {
      // Preload in parallelo di dati che probabilmente serviranno
      await Promise.allSettled([
        this.checkFavoriteStatus(userId, productId),
        this.getRecentProducts(userId, 5, true) // Solo 5 per il preload
      ]);
      
      console.log(`[PRELOAD] Dati correlati precaricati per prodotto ${productId}`);
    } catch (error) {
      console.warn(`[PRELOAD] Errore nel preload dei dati correlati:`, error);
    }
  }
  
  // Ottimizzazione: Bulk operations per operazioni multiple
  static async bulkUpdateProducts(updates: Array<{ id: string; data: Partial<ProductRecord> }>) {
    if (updates.length === 0) return [];
    
    try {
      const results = await Promise.allSettled(
        updates.map(update => 
          supabase
            .from('products')
            .update(update.data)
            .eq('id', update.id)
            .select()
            .single()
        )
      );
      
      // Invalida cache per i prodotti aggiornati
      updates.forEach(update => {
        queryCache.invalidate(update.id);
      });
      
      return results;
    } catch (error) {
      console.error(`[API ERROR] Errore bulk update prodotti:`, error);
      throw error;
    }
  }
  
  // Ottimizzazione: Statistiche cache per debug
  static getCacheStats() {
    return {
      size: queryCache['cache'].size,
      keys: Array.from(queryCache['cache'].keys())
    };
  }
}

// Export dell'istanza del servizio ottimizzato
export const optimizedProductService = OptimizedProductService;

// Cleanup automatico quando l'app va in background (se supportato)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      queryCache.cleanup();
    }
  });
} 