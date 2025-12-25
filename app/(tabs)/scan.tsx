import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Button, Image, Alert, ActivityIndicator, FlatList, TextInput } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { supabase, Property } from '@/lib/supabase';
import { analyzeImage } from '@/lib/gemini';

interface AnalysisItem {
  name: string;
  count: number;
  condition: string;
}

export default function ScanScreen() {
  const params = useLocalSearchParams<{ propertyId: string }>();
  const [selectedPropId, setSelectedPropId] = useState<string | null>(params.propertyId || null);
  const [properties, setProperties] = useState<Property[]>([]);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AnalysisItem[] | null>(null);
  const [roomName, setRoomName] = useState('Kitchen');
  const [locationName, setLocationName] = useState('');
  const cameraRef = useRef<CameraView>(null);

  // If params change (e.g. navigation from property detail), update state
  useEffect(() => {
    if (params.propertyId) {
      setSelectedPropId(params.propertyId);
    }
  }, [params.propertyId]);

  // Persist selected property ID even if params are cleared (optional but safer)
  useEffect(() => {
    if (selectedPropId) {
      // Logic to ensure ID is tracked if needed
    }
  }, [selectedPropId]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedPropId) {
        fetchProperties();
      }
    }, [selectedPropId])
  );

  async function fetchProperties() {
    const { data } = await supabase.from('properties').select('*').order('created_at', { ascending: false });
    if (data) setProperties(data);
  }

  if (!selectedPropId) {
    return (
      <SafeAreaView style={styles.selectionContainer}>
        <Text style={styles.selectionTitle}>Select Property</Text>
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.propertyCard} 
              onPress={() => setSelectedPropId(item.id)}
            >
              <FontAwesome name="building" size={24} color="#007AFF" style={styles.propertyIcon} />
              <View>
                <Text style={styles.propertyName}>{item.name}</Text>
                <Text style={styles.propertyAddress}>{item.address}</Text>
              </View>
              <FontAwesome name="chevron-right" size={16} color="#ccc" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    );
  }

  if (!permission) {
    // Camera permissions are still loading.
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginBottom: 10 }}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  async function takePicture() {
    if (cameraRef.current) {
      const result = await cameraRef.current.takePictureAsync();
      if (result) {
        setPhoto(result.uri);
        setAnalysisResults(null);
      }
    }
  }

  async function uploadAndAnalyzePhoto() {
    if (!photo) return;

    try {
      setUploading(true);
      
      const fileExt = photo.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      
      const formData = new FormData();
      formData.append('file', {
        uri: photo,
        name: fileName,
        type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      } as any);

      console.log('Attempting upload to Photos bucket:', fileName);
      const { data, error } = await supabase.storage
        .from('Photos')
        .upload(fileName, formData);

      if (error) {
        console.error('Storage upload error details:', error);
        throw error;
      }
      console.log('Upload successful:', data);

      // Start Analysis before inserting to bypass potential RLS update restrictions
      setAnalyzing(true);
      let results: AnalysisItem[] = [];
      try {
        console.log('Starting AI Analysis...');
        results = await analyzeImage(photo);
        console.log('AI Analysis Results:', JSON.stringify(results, null, 2));
        setAnalysisResults(results);
      } catch (analysisError: any) {
        console.error('Analysis error:', analysisError);
        // Continue to save the scan even if analysis fails, but with empty results
      } finally {
        setAnalyzing(false);
      }

      if (!selectedPropId) {
        Alert.alert('Error', 'Every item needs a home. Please select a property first.');
        return;
      }

      console.log('Attempting database insert into scans table...');
      const { data: dbData, error: dbError } = await supabase
        .from('scans')
        .insert({
          image_path: fileName,
          status: results.length > 0 ? 'complete' : 'uploaded',
          room_name: roomName,
          property_id: selectedPropId,
          // Store location inside ai_analysis JSON since we can't easily add a column
          ai_analysis: { 
            items: results,
            location: locationName 
          }
        })
        .select();

      if (dbError) {
        console.error('Database insert error details:', dbError);
        Alert.alert('Database Error', (dbError as any).message);
        return;
      }
      
      console.log('Database insert successful:', dbData);

      const totalItems = Array.isArray(results) 
        ? results.reduce((sum: number, item: AnalysisItem) => sum + (item.count || 0), 0)
        : 0;
        
      Alert.alert('Inventory Complete!', `Found ${totalItems} items.`);

    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Error', error.message || 'Failed to process photo');
    } finally {
      setUploading(false);
    }
  }

  const renderItem = ({ item }: { item: AnalysisItem }) => (
    <View style={styles.resultItem}>
      <Text style={styles.resultText}>{item.name}</Text>
      <Text style={styles.resultText}>{item.count}</Text>
      <Text style={styles.resultText}>{item.condition}</Text>
    </View>
  );

  if (photo) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photo }} style={styles.preview} />
        
        {analyzing && (
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color="white" />
            <Text style={styles.analyzingText}>Analyzing...</Text>
          </View>
        )}

        {analysisResults && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>Analysis Results</Text>
            <View style={styles.resultHeader}>
              <Text style={styles.headerText}>Item</Text>
              <Text style={styles.headerText}>Qty</Text>
              <Text style={styles.headerText}>Condition</Text>
            </View>
            <FlatList
              data={analysisResults}
              renderItem={renderItem}
              keyExtractor={(item, index) => index.toString()}
              style={styles.resultsList}
            />
            <View style={styles.totalContainer}>
              <Text style={styles.totalText}>
                Total Items: {analysisResults.reduce((sum, item) => sum + item.count, 0)}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.scanNextButton} 
              onPress={() => {
                setPhoto(null);
                setAnalysisResults(null);
              }}
            >
              <Text style={styles.scanNextText}>Scan Next Item</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.finishButton} 
              onPress={() => {
                setPhoto(null);
                setAnalysisResults(null);
                // Navigate to the property detail for the current property
                router.replace({ pathname: '/property/[id]', params: { id: selectedPropId } });
                setSelectedPropId(null); // Reset if they come back to scan tab directly
              }}
            >
              <Text style={styles.finishText}>Finish Room</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.previewButtonContainer}>
          <TouchableOpacity 
            style={styles.previewButton} 
            onPress={() => {
              setPhoto(null);
              setAnalysisResults(null);
            }}
            disabled={uploading || analyzing}
          >
            <Text style={styles.buttonText}>Retake</Text>
          </TouchableOpacity>
          {!analysisResults && (
            <TouchableOpacity 
              style={[styles.previewButton, styles.saveButton]} 
              onPress={uploadAndAnalyzePhoto}
              disabled={uploading || analyzing}
            >
              <Text style={styles.buttonText}>
                {uploading ? 'Uploading...' : 'Save'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        <SafeAreaView style={styles.headerOverlay}>
          <TextInput
            style={styles.roomInput}
            value={roomName}
            onChangeText={setRoomName}
            placeholder="Room (e.g. Kitchen)"
            placeholderTextColor="rgba(255,255,255,0.7)"
          />
          <TextInput
            style={[styles.roomInput, styles.locationInput]}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Location (e.g. East Wall)"
            placeholderTextColor="rgba(255,255,255,0.7)"
          />
        </SafeAreaView>
        <View style={styles.shutterContainer}>
          <TouchableOpacity 
            style={styles.shutterButton} 
            onPress={takePicture}
          />
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'black',
  },
  selectionContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  selectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 20,
    textAlign: 'center',
  },
  propertyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  propertyIcon: {
    marginRight: 15,
  },
  propertyName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  propertyAddress: {
    fontSize: 14,
    color: '#666',
  },
  camera: {
    flex: 1,
  },
  shutterContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 40,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 10,
    zIndex: 20,
  },
  roomInput: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    minWidth: 150,
    marginBottom: 8,
  },
  locationInput: {
    fontSize: 14,
    fontWeight: '400',
    minWidth: 200,
  },
  shutterButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'white',
    borderWidth: 5,
    borderColor: '#ccc',
  },
  preview: {
    flex: 1,
    resizeMode: 'contain',
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultsContainer: {
    backgroundColor: 'white',
    margin: 20,
    padding: 15,
    borderRadius: 10,
    maxHeight: '70%',
    width: '90%',
    alignSelf: 'center',
    position: 'absolute',
    top: '10%',
    zIndex: 10,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
    marginBottom: 5,
  },
  headerText: {
    fontWeight: 'bold',
    flex: 1,
  },
  resultsList: {
    flexGrow: 0,
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  resultText: {
    flex: 1,
  },
  totalContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'flex-end',
  },
  totalText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  previewButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: 'black',
  },
  previewButton: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#444',
    minWidth: 100,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scanNextButton: {
    backgroundColor: '#34C759',
    marginTop: 20,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
  },
  scanNextText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  finishButton: {
    backgroundColor: 'transparent',
    marginTop: 10,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  finishText: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  text: {
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  listContent: {
    padding: 15,
  },
});
