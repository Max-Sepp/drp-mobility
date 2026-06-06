module.exports = {
  expo: {
    name: 'drp-mobility',
    slug: 'drp-mobility',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.drpmobility.app',
      infoPlist: {
        NSCameraUsageDescription:
          'Used to take a photo of the broken equipment when reporting an issue.',
        NSLocationWhenInUseUsageDescription:
          'Used to show your position on the map and find nearby stations.',
        NSMicrophoneUsageDescription:
          'Used to search by voice — speak a station name or destination.',
        NSSpeechRecognitionUsageDescription:
          'Used to convert your spoken search query into text.',
      },
    },
    android: {
      package: 'com.drpmobility.app',
      googleServicesFile: './google-services.json',
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },
    updates: {
      url: 'https://u.expo.dev/fa941353-94dc-490c-a5b0-209e52e4ee56',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    extra: {
      eas: {
        projectId: 'fa941353-94dc-490c-a5b0-209e52e4ee56',
      },
    },
    plugins: [
      '@react-native-community/datetimepicker',
      'expo-secure-store',
      'expo-notifications',
      'expo-location',
      'expo-image-picker',
      'expo-speech-recognition',
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: true,
          },
        },
      ],
    ],
  },
}
