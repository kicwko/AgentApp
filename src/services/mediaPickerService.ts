import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
  CameraOptions,
  ImageLibraryOptions,
} from 'react-native-image-picker';

const { FilePickerModule } = NativeModules;

export interface PickedMediaResult {
  uri: string;
  fileName: string;
  type: string;
  base64?: string;
  dataUri?: string;
  fileSize?: number;
}

export const requestCameraPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera Access Permission',
        message:
          'Kweecko requires camera access so you can capture document photos, cheques, and your selfie verification picture.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
};

export const mediaPickerService = {
  /**
   * Capture a photo live using device camera.
   */
  takePhoto: async (options?: { isSelfie?: boolean }): Promise<PickedMediaResult | null> => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      throw new Error('Camera permission was denied. Please allow camera access in Settings.');
    }

    // Exclusively use in-app dedicated Front Camera on Android (no back camera or switch option)
    if (options?.isSelfie && Platform.OS === 'android' && FilePickerModule?.captureFrontSelfie) {
      try {
        const nativeSelfie = await FilePickerModule.captureFrontSelfie();
        if (!nativeSelfie) return null;
        return {
          uri: nativeSelfie.uri,
          fileName: nativeSelfie.fileName || 'selfie.jpg',
          type: nativeSelfie.type || 'image/jpeg',
          base64: nativeSelfie.base64 || '',
          dataUri:
            nativeSelfie.dataUri ||
            (nativeSelfie.base64 ? `data:image/jpeg;base64,${nativeSelfie.base64}` : nativeSelfie.uri),
          fileSize: nativeSelfie.size,
        };
      } catch (err: any) {
        console.warn('[mediaPickerService] captureFrontSelfie error, falling back to camera intent:', err?.message);
      }
    }

    const cameraOptions: CameraOptions = {
      mediaType: 'photo',
      cameraType: options?.isSelfie ? 'front' : 'back',
      includeBase64: true,
      quality: 0.8,
      maxWidth: 1280,
      maxHeight: 1280,
      saveToPhotos: false,
    };

    const response: ImagePickerResponse = await launchCamera(cameraOptions);
    if (response.didCancel) return null;
    if (response.errorCode) {
      throw new Error(response.errorMessage || 'Camera capture failed');
    }

    const asset = response.assets?.[0];
    if (!asset || !asset.uri) return null;

    const mime = asset.type || 'image/jpeg';
    const base64Data = asset.base64 || '';
    const dataUri = base64Data ? `data:${mime};base64,${base64Data}` : asset.uri;

    return {
      uri: asset.uri,
      fileName: asset.fileName || (options?.isSelfie ? 'selfie.jpg' : 'captured_image.jpg'),
      type: mime,
      base64: base64Data,
      dataUri,
      fileSize: asset.fileSize,
    };
  },

  /**
   * Pick an image from device gallery.
   */
  pickImage: async (): Promise<PickedMediaResult | null> => {
    const libraryOptions: ImageLibraryOptions = {
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.8,
      maxWidth: 1600,
      maxHeight: 1600,
      selectionLimit: 1,
    };

    const response: ImagePickerResponse = await launchImageLibrary(libraryOptions);
    if (response.didCancel) return null;
    if (response.errorCode) {
      throw new Error(response.errorMessage || 'Image selection failed');
    }

    const asset = response.assets?.[0];
    if (!asset || !asset.uri) return null;

    const mime = asset.type || 'image/jpeg';
    const base64Data = asset.base64 || '';
    const dataUri = base64Data ? `data:${mime};base64,${base64Data}` : asset.uri;

    return {
      uri: asset.uri,
      fileName: asset.fileName || 'selected_image.jpg',
      type: mime,
      base64: base64Data,
      dataUri,
      fileSize: asset.fileSize,
    };
  },

  /**
   * Pick any document or file (PDF, image, document) using system storage.
   */
  pickDocument: async (mimeType: string = '*/*'): Promise<PickedMediaResult | null> => {
    if (FilePickerModule && FilePickerModule.pickFile) {
      try {
        const res = await FilePickerModule.pickFile(mimeType);
        if (!res) return null;
        return {
          uri: res.uri,
          fileName: res.fileName || 'document.pdf',
          type: res.type || 'application/pdf',
          base64: res.base64,
          dataUri: res.dataUri || res.uri,
          fileSize: res.size,
        };
      } catch (err) {
        console.warn('[FilePicker] Native picker error, fallback to image library:', err);
      }
    }

    return mediaPickerService.pickImage();
  },
};
