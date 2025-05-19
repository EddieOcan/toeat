"use client"

import type React from "react"
import { useState, useEffect, useImperativeHandle, forwardRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface BarcodeScannerViewProps {
  onScan: (barcode: string) => void
  onClose: () => void
  isCameraActive: boolean
}

export interface BarcodeScannerViewRef {
  resetScanner: () => void;
}

const BarcodeScannerView = forwardRef<BarcodeScannerViewRef, BarcodeScannerViewProps>(({ onScan, onClose, isCameraActive }, ref) => {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [torch, setTorch] = useState(false)
  const { colors } = useTheme()

  useEffect(() => {
    if (!permission) {
      requestPermission()
    }
  }, [permission])

  useImperativeHandle(ref, () => ({
    resetScanner: () => {
      setScanned(false);
      console.log("[BarcodeScannerView] Scanner resettato.");
    }
  }));

  const hasPermission = permission?.granted ?? null

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return
    setScanned(true)
    onScan(data)
  }

  const toggleTorch = () => {
    setTorch(!torch)
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },
    camera: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
    },
    scanArea: {
      width: 300,
      height: 150,
      borderRadius: 16,
      backgroundColor: "transparent",
      position: 'relative',
    },
    corner: {
      position: 'absolute',
      width: 35,
      height: 35,
      borderColor: colors.primary,
    },
    topLeftCorner: {
      top: -2,
      left: -2,
      borderTopWidth: 5,
      borderLeftWidth: 5,
      borderTopLeftRadius: 18,
    },
    topRightCorner: {
      top: -2,
      right: -2,
      borderTopWidth: 5,
      borderRightWidth: 5,
      borderTopRightRadius: 18,
    },
    bottomLeftCorner: {
      bottom: -2,
      left: -2,
      borderBottomWidth: 5,
      borderLeftWidth: 5,
      borderBottomLeftRadius: 18,
    },
    bottomRightCorner: {
      bottom: -2,
      right: -2,
      borderBottomWidth: 5,
      borderRightWidth: 5,
      borderBottomRightRadius: 18,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#000",
    },
    permissionContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
      padding: 20,
    },
    permissionText: {
      color: colors.text,
      fontSize: 16,
      textAlign: "center",
      marginBottom: 20,
    },
    permissionButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 15,
      alignItems: "center",
    },
    permissionButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
    },
    controlsContainer: {
      position: "absolute",
      bottom: 45,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-around",
      padding: 20,
    },
    controlButton: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    closeButton: {
      position: "absolute",
      top: 40,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    scanText: {
      position: "absolute",
      top: "20%",
      alignSelf: 'center',
      textAlign: "center",
      color: "#FFFFFF",
      fontSize: 13,
      fontFamily: 'Bricolage Grotesque',
      backgroundColor: "rgba(0,0,0,0.5)",
      paddingVertical: 8,
      paddingHorizontal: 13,
      marginHorizontal: 20,
      borderRadius: 8,
      zIndex: 1,
    },
  })

  if (!isCameraActive) {
    return <View style={{ flex: 1, backgroundColor: "black" }} />;
  }

  if (hasPermission === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (hasPermission === false) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          È necessario concedere l'accesso alla fotocamera per utilizzare lo scanner.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Concedi Permesso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 15 }} onPress={onClose}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Chiudi scanner</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'],
        }}
        facing={"back"}
        flash={torch ? "on" : "off"}
      />

      <Text style={styles.scanText} numberOfLines={1}>Posiziona il codice a barre all'interno del riquadro</Text>

      <View style={styles.overlay}>
        <View style={styles.scanArea}>
          <View style={[styles.corner, styles.topLeftCorner]} />
          <View style={[styles.corner, styles.topRightCorner]} />
          <View style={[styles.corner, styles.bottomLeftCorner]} />
          <View style={[styles.corner, styles.bottomRightCorner]} />
        </View>
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleTorch}>
          <Ionicons name={torch ? "flash" : "flash-off"} size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  )
})

export default BarcodeScannerView
