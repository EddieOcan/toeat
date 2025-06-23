export const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const formatNutritionValue = (value: number, unit: string): string => {
  if (isNaN(value)) return "N/A"
  // Mostra decimali solo se necessari (es. 14.5 kcal, ma 15g invece di 15.0g)
  const formattedValue = value % 1 === 0 ? value.toString() : value.toFixed(1)
  return `${formattedValue} ${unit}`
}

export const getNutritionGradeLabel = (grade: string): string => {
  switch (grade?.toLowerCase()) {
    case "a":
      return "Eccellente"
    case "b":
      return "Buono"
    case "c":
      return "Medio"
    case "d":
      return "Scarso"
    case "e":
      return "Pessimo"
    default:
      return "Non disponibile"
  }
}

export const getEcoScoreLabel = (grade: string): string => {
  switch (grade?.toLowerCase()) {
    case "a":
      return "Impatto ambientale molto basso"
    case "b":
      return "Impatto ambientale basso"
    case "c":
      return "Impatto ambientale moderato"
    case "d":
      return "Impatto ambientale alto"
    case "e":
      return "Impatto ambientale molto alto"
    default:
      return "Impatto ambientale non valutato"
  }
}

/**
 * Assegna un colore basato sul punteggio numerico di salute/eco
 * Categorie uniformi per tutta l'app:
 * 1-20: rosso
 * 21-40: giallo  
 * 41-60: verdino
 * 61-90: verde
 * 91-100: azzurro
 */
export const getScoreColor = (score: number | undefined | null): string => {
  if (score === undefined || score === null || score < 0) {
    return '#888888'; // Grigio per valori non validi
  }
  
  if (score >= 91) return '#4A90E2'; // Azzurro per eccellente (91-100)
  if (score >= 61) return '#1E8F4E'; // Verde per buono (61-90)
  if (score >= 41) return '#7AC547'; // Verdino per medio (41-60)
  if (score >= 21) return '#E6A500'; // Giallo più scuro per scarso (21-40)
  return '#FF0000'; // Rosso per molto scarso (1-20)
};
