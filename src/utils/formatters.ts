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
  return `${value.toFixed(1)} ${unit}`
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
