import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase, Property } from '@/lib/supabase';

export default function PropertyListScreen() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropAddress, setNewPropAddress] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchProperties();
    }, [])
  );

  async function fetchProperties() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching properties:', error);
      } else {
        setProperties(data || []);
      }
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addProperty() {
    if (!newPropName.trim() || !newPropAddress.trim()) {
      Alert.alert('Error', 'Please enter both name and address');
      return;
    }

    try {
      const { error } = await supabase
        .from('properties')
        .insert({
          name: newPropName.trim(),
          address: newPropAddress.trim(),
        });

      if (error) throw error;

      setNewPropName('');
      setNewPropAddress('');
      setShowAddForm(false);
      fetchProperties();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function deleteProperty(id: string) {
    Alert.alert(
      "Delete Property",
      "Are you sure? This will delete the property AND all its inventory scans.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              // Delete property (Cascade should handle scans, but we can be explicit if needed)
              const { error } = await supabase.from('properties').delete().eq('id', id);
              if (error) throw error;
              fetchProperties();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  }

  const renderItem = ({ item }: { item: Property }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => router.push({ pathname: '/property/[id]', params: { id: item.id } })}
    >
      <View style={styles.iconContainer}>
        <FontAwesome name="building-o" size={24} color="#007AFF" />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.propName}>{item.name}</Text>
        <Text style={styles.propAddress}>{item.address}</Text>
      </View>
      <TouchableOpacity onPress={() => deleteProperty(item.id)} style={styles.deleteButton}>
        <FontAwesome name="trash-o" size={20} color="#FF3B30" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Properties</Text>
        <TouchableOpacity onPress={() => setShowAddForm(!showAddForm)} style={styles.addButton}>
          <FontAwesome name={showAddForm ? "minus" : "plus"} size={20} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {showAddForm && (
        <View style={styles.addForm}>
          <TextInput
            style={styles.input}
            placeholder="Property Name (e.g. Downtown Apt)"
            value={newPropName}
            onChangeText={setNewPropName}
          />
          <TextInput
            style={styles.input}
            placeholder="Address"
            value={newPropAddress}
            onChangeText={setNewPropAddress}
          />
          <TouchableOpacity style={styles.submitButton} onPress={addProperty}>
            <Text style={styles.submitButtonText}>Create Property</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && properties.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#007AFF" />
      ) : properties.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No properties found.</Text>
          <Text style={styles.emptySubText}>Tap + to add your first property.</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: { fontSize: 28, fontWeight: 'bold' },
  addButton: { padding: 10 },
  addForm: { padding: 20, backgroundColor: '#f9f9f9', borderBottomWidth: 1, borderBottomColor: '#eee' },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
  },
  submitButton: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  submitButtonText: { color: 'white', fontWeight: 'bold' },
  listContent: { padding: 15 },
  card: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#eef6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  cardContent: { flex: 1 },
  propName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  propAddress: { fontSize: 14, color: '#666' },
  deleteButton: { padding: 10 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  emptySubText: { fontSize: 14, color: '#666', marginTop: 5 },
});
