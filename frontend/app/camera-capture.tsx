import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';

const uploadEndpoint = process.env.EXPO_PUBLIC_UPLOAD_URL ?? 'http://127.0.0.1:3001/upload';
const CAMERA_COOKIE_KEY = 'vocalis_camera_access_requested';

async function hasCameraHardwareAsync(): Promise<boolean> {
  try {
    const method = (Camera as any).getAvailableCameraTypesAsync;
    if (typeof method === 'function') {
      const types = await method.call(Camera);
      return Array.isArray(types) && types.length > 0;
    }

    const fallback = (Camera as any).isAvailableAsync;
    if (typeof fallback === 'function') {
      return Boolean(await fallback.call(Camera));
    }
  } catch (error) {
    console.error('Camera availability helper error', error);
  }
  return false;
}

export default function CameraCapture() {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(true);

  useEffect(() => {
    let active = true;
    const detectCamera = async () => {
      try {
        setCheckingAvailability(true);
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!active) return;
          const hasVideo = devices.some((d) => d.kind === 'videoinput');
          if (hasVideo) {
            setCameraAvailable(true);
            return;
          }

          const alreadyRequested = hasCameraRequestCookie();
          if (!alreadyRequested && navigator.mediaDevices?.getUserMedia) {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ video: true });
              stream.getTracks().forEach((t) => t.stop());
              markCameraRequestCookie();
              if (!active) return;
              setCameraAvailable(true);
              return;
            } catch (requestError) {
              console.error('Web camera prompt failed', requestError);
              markCameraRequestCookie();
            }
          }

          setCameraAvailable(false);
          return;
        }

        const available = await hasCameraHardwareAsync();
        if (!active) return;
        setCameraAvailable(available);
      } catch (error) {
        console.error('Camera availability check failed', error);
        if (active) setCameraAvailable(false);
      } finally {
        if (active) setCheckingAvailability(false);
      }
    };

    detectCamera();
    return () => {
      active = false;
    };
  }, []);

  const hasPermission = permission?.granted;

  const handlePermissionPress = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraAvailable(false);
          Alert.alert('Camera Unsupported', 'This browser does not support camera access.');
          return;
        }

        try {
          const testStream = await navigator.mediaDevices.getUserMedia({ video: true });
          testStream.getTracks().forEach((t) => t.stop());
          markCameraRequestCookie();
          setCameraAvailable(true);
        } catch (err) {
          console.error('Web camera permission denied', err);
          setCameraAvailable(false);
          Alert.alert('Camera Access Blocked', 'Please allow camera access in your browser settings.');
          return;
        }
      }

      const hasCamera = Platform.OS === 'web' ? cameraAvailable !== false : await hasCameraHardwareAsync();
      setCameraAvailable(hasCamera);
      if (!hasCamera) {
        Alert.alert('No Camera Found', 'This device does not have an available camera application.');
        return;
      }

      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert('Permission Required', 'Camera access is needed to capture photos.');
      }
    } catch (error) {
      console.error('Permission request failed', error);
      Alert.alert('Camera Error', 'Unable to verify camera availability. Please try again.');
    }
  };

  const handleCaptureAsync = async () => {
    if (!cameraRef.current || isProcessing) {
      return;
    }

    try {
      setIsProcessing(true);
        const photo = await cameraRef.current.takePictureAsync
          ? await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true })
          : null;

        if (!photo?.uri) {
          throw new Error('No photo URI returned');
        }

        // Immediately navigate back with the local photo URI so the UI updates fast.
        try {
          router.replace({ pathname: '/updatedSearch', params: { uploadedUrl: photo.uri } });
        } catch (navErr) {
          console.warn('Immediate navigation with local URI failed', navErr);
        }

        // Then upload in background; if upload returns a hosted URL, replace route again so app can use the canonical URL.
        try {
          const uploaded = await uploadPhotoAsync(photo.uri);
          if (uploaded?.url) {
            router.replace({ pathname: '/updatedSearch', params: { uploadedUrl: uploaded.url } });
          } else {
            Alert.alert('Upload failed', 'No URL returned from the server.');
          }
        } catch (uploadErr) {
          console.error('Upload failure', uploadErr);
          // keep the local photo URI in the UI; inform the user
          Alert.alert('Upload failed', 'We could not upload the photo. The local image was returned to the app.');
        }
    } catch (error) {
      console.error('Camera capture error', error);
      Alert.alert('Capture error', 'We could not capture or upload the photo. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

    if (checkingAvailability || cameraAvailable === null || !permission) {
    return (
      <View style={styles.centeredFallback}>
        <Text style={styles.fallbackText}>Checking camera permissions...</Text>
      </View>
    );
  }

  if (cameraAvailable === false) {
    return (
      <View style={styles.centeredFallback}>
        <Text style={styles.fallbackText}>No camera application was detected on this device.</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={handlePermissionPress} accessibilityRole="button">
          <Text style={styles.permissionText}>Retry Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permissionBtn} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.permissionText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centeredFallback}>
        <Text style={styles.fallbackText}>Camera access is required. Please enable it in Settings.</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={handlePermissionPress} accessibilityRole="button">
          <Text style={styles.permissionText}>Allow Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permissionBtn} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.permissionText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Use Camera on native and CameraView on web for best compatibility */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.captureButton, isProcessing && styles.captureDisabled]}
            disabled={isProcessing}
            onPress={handleCaptureAsync}
            accessibilityRole="button"
            accessibilityLabel="Capture photo"
          >
            {isProcessing ? <ActivityIndicator color="#000" /> : <Text style={styles.captureText}>Capture</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

async function uploadPhotoAsync(uri: string) {
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: `capture-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as any);

  const response = await fetch(uploadEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Upload failed');
  }

  try {
    return await response.json();
  } catch (error) {
    console.error('Upload response parse error', error);
    return undefined;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  closeButton: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  bottomBar: {
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e7c6f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureDisabled: {
    opacity: 0.6,
  },
  captureText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  centeredFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  fallbackText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionBtn: {
    backgroundColor: '#e7c6f8',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  permissionText: {
    color: '#000',
    fontWeight: '700',
  },
});

function hasCameraRequestCookie() {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((cookie) => cookie.trim().startsWith(`${CAMERA_COOKIE_KEY}=`));
}

function markCameraRequestCookie() {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  document.cookie = `${CAMERA_COOKIE_KEY}=1; path=/; max-age=${maxAge}`;
}