import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { FontAwesome } from '@expo/vector-icons';

interface InventoryItem {
  name: string;
  count: number;
  condition: string;
}

interface ScanData {
  id: string;
  created_at: string;
  room_name: string;
  status: string;
  image_path: string;
  ai_analysis: InventoryItem[] | { items: InventoryItem[]; location?: string };
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [scan, setScan] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [items, setItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    fetchScanDetails();
  }, [id]);

  async function fetchScanDetails() {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      console.log('Fetched Scan Data:', JSON.stringify(data, null, 2));

      setScan(data);
      setRoomName(data.room_name);
      
      // Robustly parse the items, handling both direct array and wrapped 'items' object
      let parsedItems: InventoryItem[] = [];
      let parsedLocation = '';
      
      // Handle case where ai_analysis might be a string (if Supabase returned it as text)
      let aiAnalysis = data.ai_analysis;
      if (typeof aiAnalysis === 'string') {
        try {
          aiAnalysis = JSON.parse(aiAnalysis);
        } catch (e) {
          console.error('Failed to parse ai_analysis string:', e);
        }
      }

      if (Array.isArray(aiAnalysis)) {
        parsedItems = aiAnalysis;
      } else if (aiAnalysis && typeof aiAnalysis === 'object') {
        if ('items' in aiAnalysis && Array.isArray((aiAnalysis as any).items)) {
          parsedItems = (aiAnalysis as any).items;
        }
        if ('location' in aiAnalysis) {
          parsedLocation = (aiAnalysis as any).location || '';
        }
      } else {
        console.warn('Unexpected ai_analysis format:', aiAnalysis);
      }
      
      console.log('Parsed Items:', JSON.stringify(parsedItems, null, 2));
      setItems(parsedItems);
      setLocationName(parsedLocation);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to fetch details');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const getImageUrl = (path: string) => {
    return supabase.storage.from('Photos').getPublicUrl(path).data.publicUrl;
  };

  const updateItemCount = (index: number, change: number) => {
    const newItems = [...items];
    newItems[index].count = Math.max(0, newItems[index].count + change);
    setItems(newItems);
  };

  const updateItemName = (index: number, text: string) => {
    const newItems = [...items];
    newItems[index].name = text;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { name: '', count: 1, condition: 'Good' }]);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  async function saveChanges() {
    try {
      setSaving(true);
      console.log('Attempting UPDATE for ID:', id);
      
      const { data, error } = await supabase
        .from('scans')
        .update({
          room_name: roomName.trim(), // Normalize room name
          ai_analysis: {
            items: items,
            location: locationName.trim()
          },
        })
        .eq('id', id)
        .select();

      if (error) throw error;

      // Check if the update actually affected any rows
      if (!data || data.length === 0) {
        Alert.alert(
          'Update Failed (Permission Denied)', 
          'The database refused the update. This is likely due to Row Level Security (RLS) policies.\n\nPlease go to Supabase > Authentication > Policies and enable UPDATE for the "scans" table.'
        );
        return;
      }

      Alert.alert('Success', 'Changes saved successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save changes');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteScan() {
    Alert.alert(
      "Delete Scan",
      "Are you sure you want to delete this scan?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              const { error } = await supabase
                .from('scans')
                .delete()
                .eq('id', id);

              if (error) throw error;
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete scan');
              console.error(error);
              setSaving(false);
            }
          }
        }
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!scan) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="chevron-left" size={20} color="#007AFF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Inventory</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: getImageUrl(scan.image_path) }} style={styles.image} />

        <View style={styles.section}>
          <Text style={styles.label}>Room Name</Text>
          <TextInput
            style={styles.input}
            value={roomName}
            onChangeText={setRoomName}
            placeholder="Room Name"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Location (e.g. East Wall)"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Inventory Items</Text>
            <TouchableOpacity onPress={addItem} style={styles.addItemButton}>
              <FontAwesome name="plus" size={14} color="white" />
              <Text style={styles.addItemText}>Add Item</Text>
            </TouchableOpacity>
          </View>
          
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No items found. Add one manually.</Text>
          ) : (
            items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <TouchableOpacity 
                  onPress={() => removeItem(index)}
                  style={styles.deleteItemButton}
                >
                  <FontAwesome name="trash" size={16} color="#FF3B30" />
                </TouchableOpacity>
                <TextInput
                  style={styles.itemNameInput}
                  value={item.name}
                  onChangeText={(text) => updateItemName(index, text)}
                  placeholder="Item Name"
                />
                <View style={styles.stepper}>
                  <TouchableOpacity 
                    onPress={() => updateItemCount(index, -1)}
                    style={styles.stepButton}
                  >
                    <FontAwesome name="minus" size={12} color="white" />
                  </TouchableOpacity>
                  <Text style={styles.countText}>{item.count}</Text>
                  <TouchableOpacity 
                    onPress={() => updateItemCount(index, 1)}
                    style={styles.stepButton}
                  >
                    <FontAwesome name="plus" size={12} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={saveChanges}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.auditButton} 
          onPress={() => router.push({
            pathname: '/audit/camera',
            params: { 
              originalImageUri: getImageUrl(scan.image_path),
              expectedItems: JSON.stringify(items)
            }
          })}
        >
          <FontAwesome name="check-square-o" size={20} color="white" />
          <Text style={styles.auditButtonText}>Audit This Scan</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.deleteButton} 
          onPress={deleteScan}
          disabled={saving}
        >
          <Text style={styles.deleteButtonText}>Delete Scan</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
  },
  backText: {
    marginLeft: 5,
    color: '#007AFF',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  image: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#f0f0f0',
  },
  section: {
    marginBottom: 25,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  itemNameInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 10,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  stepButton: {
    backgroundColor: '#007AFF',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 15,
    minWidth: 20,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  auditButton: {
    backgroundColor: '#5856D6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  auditButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  addItemButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addItemText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  deleteItemButton: {
    padding: 8,
    marginRight: 5,
  },
});
