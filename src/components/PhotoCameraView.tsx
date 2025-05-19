'use client';

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions, CameraType, FlashMode } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface PhotoCameraViewProps {
  onPhotoTaken: (uri: string | undefined) => void;
  isCameraActive: boolean;
}

const PhotoCameraView: React.FC<PhotoCameraViewProps> = ({ onPhotoTaken, isCameraActive }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const cameraRef = useRef<CameraView>(null);
  const { colors } = useTheme();

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleTakePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.4, // Ridotta qualità per testare un payload più piccolo
          // exif: false, // Opzionale: non includere dati EXIF
        });
        if (photo && photo.uri) {
          onPhotoTaken(photo.uri);
        } else {
          Alert.alert("Errore", "Impossibile scattare la foto.");
          onPhotoTaken(undefined);
        }
      } catch (error) {
        console.error("Errore scattando la foto:", error);
        Alert.alert("Errore Fotocamera", "Si è verificato un errore durante lo scatto della foto.");
        onPhotoTaken(undefined);
      }
    }
  };

  const toggleCameraType = () => {
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlashMode = () => {
    setFlashMode(current => {
      if (current === 'off') return 'on';
      if (current === 'on') return 'auto';
      return 'off'; // auto -> off
    });
  };

  const getFlashIconName = () => {
    if (flashMode === 'on') return 'flash';
    if (flashMode === 'auto') return 'flash-outline';
    return 'flash-off';
  };
  
  if (!isCameraActive) {
    return <View style={{ flex: 1, backgroundColor: "black" }} />;
  }

  if (!permission) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text, marginTop: 10 }}>Richiesta permessi fotocamera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.permissionText, { color: colors.text }]}>
          È necessario concedere l'accesso alla fotocamera per scattare foto.
        </Text>
        <TouchableOpacity style={[styles.permissionButton, { backgroundColor: colors.primary }]} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Concedi Permesso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={cameraType}
        flash={flashMode}
        mode="picture" // Assicura che sia in modalità foto
      />
      <View style={styles.controlsOverlay}>
        <View style={styles.bottomControlsContainer}>
          <TouchableOpacity style={styles.controlButton} onPress={toggleFlashMode}>
            <Ionicons name={getFlashIconName()} size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.takePictureButton} onPress={handleTakePicture}>
            <Ionicons name="camera" size={32} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={toggleCameraType}>
            <Ionicons name="camera-reverse" size={28} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    position: 'relative',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 35,
  },
  controlButtonTop: {
    alignSelf: 'flex-end',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 25,
  },
  bottomControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 20,
    marginBottom: 15,
  },
  controlButton: {
    padding: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 30,
  },
  takePictureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 30,
  },
  permissionButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: { // Stile generico per il bottone di chiusura
    padding: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonAbsolute: { // Per posizionare il bottone in modo assoluto nella vista permessi
    position: 'absolute',
    top: 40, 
    right: 20,
  }
});

export default PhotoCameraView; 