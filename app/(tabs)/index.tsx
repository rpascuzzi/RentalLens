import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, SectionList, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { generateAndShareReport } from '@/lib/pdf';

interface InventoryItem {
  id: string;
  created_at: string;
  room_name: string;
  status: string;
  image_path: string;
  ai_analysis: any; // Allow flexible structure to support location field
}

interface RoomSection {
  title: string;
  data: InventoryItem[];
}

export default function HomeScreen() {
  const [sections, setSections] = useState<RoomSection[]>([]);
  const [loading, setLoading] = useState(false);

  function groupDataByRoom(data: InventoryItem[]): RoomSection[] {
    const groups: { [key: string]: InventoryItem[] } = {};

    data.forEach(item => {
      // Normalize room name: trim whitespace
      const room = (item.room_name || 'Unassigned').trim();
      if (!groups[room]) {
        groups[room] = [];
      }
      groups[room].push(item);
    });

    const result = Object.keys(groups)
      .sort() // Sort rooms alphabetically
      .map(room => ({
        title: room,
        data: groups[room],
      }));

    return result;
  }

  async function fetchInventory() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching inventory:', error);
      } else {
        const groupedData = groupDataByRoom(data || []);
        setSections(groupedData);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
    }, [])
  );

  const getImageUrl = (path: string) => {
    return supabase.storage.from('Photos').getPublicUrl(path).data.publicUrl;
  };

  const renderSectionHeader = ({ section: { title } }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  const renderItem = ({ item }: { item: InventoryItem }) => {
    let totalItems = 0;
    let location = '';

    const analysis = item.ai_analysis;
    if (Array.isArray(analysis)) {
      totalItems = analysis.reduce((sum, i) => sum + i.count, 0);
    } else if (analysis && typeof analysis === 'object') {
      if (Array.isArray(analysis.items)) {
        totalItems = analysis.items.reduce((sum: any, i: any) => sum + i.count, 0);
      }
      if (analysis.location) {
        location = analysis.location;
      }
    }

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
      >
        <Image 
          source={{ uri: getImageUrl(item.image_path) }} 
          style={styles.thumbnail} 
        />
        <View style={styles.cardContent}>
          <Text style={styles.roomName}>{location || item.room_name}</Text>
          <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
          <View style={styles.statsContainer}>
            <Text style={styles.statusText}>{item.status}</Text>
            {item.status === 'complete' && (
              <Text style={styles.itemCount}>{totalItems} Items Found</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>RentalLens</Text>
          <Text style={styles.subtitle}>Active Properties</Text>
        </View>
        <TouchableOpacity 
          style={styles.exportButton} 
          onPress={() => generateAndShareReport(sections)}
          disabled={sections.length === 0}
        >
          <FontAwesome name="file-pdf-o" size={20} color={sections.length === 0 ? '#ccc' : '#007AFF'} />
          <Text style={[styles.exportText, { color: sections.length === 0 ? '#ccc' : '#007AFF' }]}>Export</Text>
        </TouchableOpacity>
      </View>

      {loading && sections.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No properties found. Start by scanning a room.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  headerContainer: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  exportButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  exportText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginTop: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    color: 'gray',
    textAlign: 'center',
  },
  listContent: {
    padding: 15,
  },
  sectionHeader: {
    backgroundColor: '#f9f9f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 10,
    marginTop: 5,
  },
  sectionHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  cardContent: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'center',
  },
  roomName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  itemCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});
