import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Button, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';

export default function AuditCameraScreen() {
  const { originalImageUri, expectedItems } = useLocalSearchParams<{ 
    originalImageUri: string; 
    expectedItems: string; 
  }>();
  
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center' }}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  async function takePicture() {
    if (cameraRef.current) {
      const result = await cameraRef.current.takePictureAsync();
      if (result) {
        router.push({
          pathname: '/audit/report',
          params: {
            newImageUri: result.uri,
            originalImageUri,
            expectedItems
          }
        });
      }
    }
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        {/* Ghost Overlay */}
        {originalImageUri && (
          <View style={styles.ghostContainer} pointerEvents="none">
            <Image 
              source={{ uri: originalImageUri }} 
              style={styles.ghostImage} 
            />
          </View>
        )}
        
        <SafeAreaView style={styles.overlay}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <FontAwesome name="close" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerText}>Align with Original</Text>
          </View>
          
          <View style={styles.shutterContainer}>
            <TouchableOpacity style={styles.shutterButton} onPress={takePicture} />
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  ghostContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  ghostImage: {
    flex: 1,
    opacity: 0.3,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  headerText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 20,
  },
  backButton: {
    padding: 10,
  },
  shutterContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  shutterButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'white',
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
});
