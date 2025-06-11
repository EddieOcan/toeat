# 🔍 Log di Debug AI - Food Scanner App

## Panoramica

Sono stati aggiunti log dettagliati per tutte le chiamate AI nell'app Food Scanner. Questi log ti aiutano a capire:
- **Input**: cosa viene inviato all'AI
- **Output**: cosa risponde l'AI  
- **Token Usage**: quanti token vengono utilizzati
- **Performance**: tempi di risposta

## 📊 Tipi di Log AI

### 1. **Analisi Barcode** (`analyzeProductWithGemini`)

Quando scansioni un barcode, vedrai questi log:

```
[AI INPUT] ============= INPUT PER [BARCODE] =============
PRODOTTO: [Nome] | MARCA: [Marca]
INGREDIENTI: [Lista ingredienti]
VALORI/100g: Kcal: [X]kcal | Grassi: [X]g | ...
SCORE: Nutri: [A-E] | Nova: [1-4] | Eco: [A-E]
ANALISI: ...
JSON: {...}
[AI INPUT] ============= FINE INPUT =============

[AI OUTPUT] ============= OUTPUT PER [BARCODE] =============
{
  "healthScore": 75,
  "sustainabilityScore": 60,
  "analysis": "...",
  "pros": [...],
  "cons": [...],
  ...
}
[AI OUTPUT] ============= FINE OUTPUT =============
```

### 2. **Analisi Foto** (`analyzeImageWithGeminiVision`)

Quando analizzi una foto, vedrai log molto dettagliati:

#### **Informazioni Immagine Originale**
```
[GEMINI VISION IMAGE INFO] ======= DETTAGLI IMMAGINE ORIGINALE =======
[GEMINI VISION IMAGE INFO] Tipo MIME: image/jpeg
[GEMINI VISION IMAGE INFO] Dimensione base64: 125000 caratteri
[GEMINI VISION IMAGE INFO] Dimensione stimata file: 2.15 MB (2250000 bytes)
[GEMINI VISION IMAGE INFO] Token stimati per immagine: ~2250 token
[GEMINI VISION IMAGE INFO] ==========================================
```

#### **Informazioni Immagine Ottimizzata**
```
[GEMINI VISION IMAGE OPTIMIZED] ======= IMMAGINE OTTIMIZZATA =======
[GEMINI VISION IMAGE OPTIMIZED] Dimensione base64 ottimizzata: 87500 caratteri
[GEMINI VISION IMAGE OPTIMIZED] Dimensione file ottimizzata: 1.51 MB (1575000 bytes)
[GEMINI VISION IMAGE OPTIMIZED] Token stimati ottimizzati: ~1575 token
[GEMINI VISION IMAGE OPTIMIZED] Rapporto compressione: 70.0%
[GEMINI VISION IMAGE OPTIMIZED] Risparmio dimensione: 30.0%
[GEMINI VISION IMAGE OPTIMIZED] ====================================
```

#### **Input Dettagliato**
```
[AI VISION INPUT] ============= INPUT VISION PER [NOME_PRODOTTO] =============
[AI VISION INPUT] === PROMPT TESTUALE ===
ANALIZZA CIBO: [Nome prodotto]
OBBLIGATORIO - SEMPRE COMPILARE:
1. healthScore (0-100): Valuta salute generale
...
[AI VISION INPUT] === FINE PROMPT ===

[AI VISION INPUT] === DETTAGLI TECNICI INPUT ===
[AI VISION INPUT] Immagine MIME: image/jpeg
[AI VISION INPUT] Immagine base64 (ottimizzata): 87500 caratteri
[AI VISION INPUT] Immagine dimensione: 1.51 MB
[AI VISION INPUT] Token stimati immagine: ~1575
[AI VISION INPUT] Token stimati testo: ~200
[AI VISION INPUT] Token totali stimati: ~1775
[AI VISION INPUT] Modello: gemini-1.5-flash-8b
[AI VISION INPUT] Config temperatura: 0.1
[AI VISION INPUT] Config topK: 8
[AI VISION INPUT] Config topP: 0.75
[AI VISION INPUT] Config maxOutputTokens: 2048
[AI VISION INPUT] === FINE DETTAGLI TECNICI ===

[AI VISION INPUT] Base64 immagine (primi 100 caratteri): /9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcU...
[AI VISION INPUT] Base64 immagine (ultimi 50 caratteri): ...xyz123ABC
[AI VISION INPUT] ============= FINE INPUT VISION =============
```

#### **Output Dettagliato**
```
[AI VISION OUTPUT] ============= OUTPUT VISION PER [NOME_PRODOTTO] =============
[AI VISION OUTPUT] === STATISTICHE RISPOSTA ===
[AI VISION OUTPUT] Lunghezza risposta: 850 caratteri
[AI VISION OUTPUT] Token stimati risposta: ~212
[AI VISION OUTPUT] Token input stimati: ~1775
[AI VISION OUTPUT] Token totali stimati (input + output): ~1987
[AI VISION OUTPUT] === FINE STATISTICHE ===

[AI VISION OUTPUT] === RISPOSTA COMPLETA ===
{
  "productNameFromVision": "Insalata mista",
  "healthScore": 85,
  "analysis": "Piatto ricco di vitamine e minerali...",
  "pros": [...],
  "cons": [...],
  "calorie_estimation_type": "breakdown",
  "ingredients_breakdown": [...],
  "calories_estimate": "Totale: ~250 kcal",
  ...
}
[AI VISION OUTPUT] === FINE RISPOSTA ===
[AI VISION OUTPUT] ============= FINE OUTPUT VISION =============
```

### 3. **Stima Calorie Ingredienti** (`getCaloriesForSingleIngredientFromGemini`)

Per la stima calorie di singoli ingredienti:

```
[AI CALORIES INPUT] ============= INPUT CALORIES PER "pomodoro" =============
[AI CALORIES INPUT] === PARAMETRI ===
[AI CALORIES INPUT] Ingrediente: "pomodoro"
[AI CALORIES INPUT] Peso: 150g
[AI CALORIES INPUT] === PROMPT ===
INGREDIENTE: "pomodoro"
PESO: per un peso di 150 grammi
CORREGGI NOME + STIMA NUTRIZIONALE:
JSON: {...}
[AI CALORIES INPUT] === DETTAGLI TECNICI ===
[AI CALORIES INPUT] Token stimati input: ~45
[AI CALORIES INPUT] Modello: gemini-1.5-flash-8b
[AI CALORIES INPUT] Config temperatura: 0.1
[AI CALORIES INPUT] Config topK: 5
[AI CALORIES INPUT] Config topP: 0.7
[AI CALORIES INPUT] Config maxOutputTokens: 128
[AI CALORIES INPUT] Timeout: 10000ms
[AI CALORIES INPUT] ============= FINE INPUT CALORIES =============

[AI CALORIES OUTPUT] ============= OUTPUT CALORIES PER "pomodoro" =============
[AI CALORIES OUTPUT] === STATISTICHE ===
[AI CALORIES OUTPUT] Lunghezza risposta: 180 caratteri
[AI CALORIES OUTPUT] Token stimati output: ~45
[AI CALORIES OUTPUT] Token totali stimati: ~90
[AI CALORIES OUTPUT] === RISPOSTA COMPLETA ===
{
  "corrected_name": "Pomodoro fresco",
  "estimated_calories_kcal": 27,
  "estimated_proteins_g": 1.5,
  "estimated_carbs_g": 5.2,
  "estimated_fats_g": 0.3,
  "error_message": ""
}
[AI CALORIES OUTPUT] ============= FINE OUTPUT CALORIES =============
```

## 🎯 Come Utilizzare i Log

### **Per Debug Sviluppatori**
1. Apri Metro/Expo console
2. Scansiona un barcode o analizza una foto
3. Cerca i tag `[AI INPUT]`, `[AI OUTPUT]`, `[AI VISION INPUT]`, etc.
4. Copia input/output per testare modifiche ai prompt

### **Per Monitoraggio Token**
- **Token Immagine**: Cerca `Token stimati immagine: ~[X]`
- **Token Testo**: Cerca `Token stimati testo: ~[X]`
- **Token Totali**: Cerca `Token totali stimati: ~[X]`

### **Per Ottimizzazione Performance**
- **Tempi API**: Cerca `[GEMINI API TIMING]` e `[GEMINI VISION API TIMING]`
- **Compressione**: Cerca `Rapporto compressione:` e `Risparmio dimensione:`

## 📱 Dove Vedere i Log

### **Metro/Expo CLI**
```bash
expo start
# I log appariranno nella console
```

### **React Native Debugger**
- Apri React Native Debugger
- I log sono visibili nella tab Console

### **Browser (Web)**
- F12 → Console
- Filtra per `[AI INPUT]` o `[AI OUTPUT]`

### **Device Logs**
- **Android**: Android Studio → Logcat
- **iOS**: Xcode → Console

## 🔧 Configurazione Log

I log sono sempre attivi. Per disabilitarli temporaneamente, commenta le righe che iniziano con:
```javascript
console.log(`[AI INPUT]...`)
console.log(`[AI OUTPUT]...`)
console.log(`[AI VISION INPUT]...`)
console.log(`[AI VISION OUTPUT]...`)
console.log(`[AI CALORIES INPUT]...`)
console.log(`[AI CALORIES OUTPUT]...`)
```

## 📊 Metriche Utili

### **Stima Token (Approssimativa)**
- **Testo**: ~4 caratteri = 1 token
- **Immagine**: ~1000 bytes = 1 token
- **Risposta JSON**: Di solito 100-500 token

### **Limiti Gemini**
- **Input Token**: Fino a 1M token per gemini-1.5-flash
- **Output Token**: Configurato a 2048 per vision, 128 per calories
- **Timeout**: 25s vision, 15s barcode, 10s calories

---

**📝 Nota**: Questi log sono pensati per il debug e l'ottimizzazione. Le stime dei token sono approssimative e possono variare rispetto ai token effettivi utilizzati da Google Gemini. 