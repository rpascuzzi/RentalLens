import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { verifyInventory } from '@/lib/gemini';

interface AuditResult {
  item: string;
  expected_count: number;
  found_count: number;
  status: 'Match' | 'Mismatch' | 'Missing';
}

export default function AuditReportScreen() {
  const { newImageUri, originalImageUri, expectedItems } = useLocalSearchParams<{
    newImageUri: string;
    originalImageUri: string;
    expectedItems: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<AuditResult[]>([]);

  useEffect(() => {
    runVerification();
  }, []);

  async function runVerification() {
    try {
      if (newImageUri && expectedItems) {
        const auditResults = await verifyInventory(newImageUri, expectedItems);
        setResults(auditResults);
      }
    } catch (error) {
      console.error('Audit verification error:', error);
    } finally {
      setLoading(false);
    }
  }

  const updateFoundCount = (index: number, change: number) => {
    const newResults = [...results];
    const newCount = Math.max(0, newResults[index].found_count + change);
    newResults[index].found_count = newCount;
    newResults[index].status = newCount === newResults[index].expected_count 
      ? 'Match' 
      : (newCount === 0 ? 'Missing' : 'Mismatch');
    setResults(newResults);
  };

  const renderItem = ({ item, index }: { item: AuditResult, index: number }) => (
    <View style={styles.resultRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.item}</Text>
        <Text style={styles.itemCounts}>Expected: {item.expected_count}</Text>
      </View>
      
      <View style={styles.correctionContainer}>
        <TouchableOpacity onPress={() => updateFoundCount(index, -1)} style={styles.miniStep}>
          <Ionicons name="remove-circle-outline" size={28} color="#666" />
        </TouchableOpacity>
        <View style={[styles.foundCountBadge, item.status !== 'Match' && styles.mismatchBadge]}>
          <Text style={[styles.foundCountText, item.status !== 'Match' && styles.mismatchText]}>
            {item.found_count}
          </Text>
        </View>
        <TouchableOpacity onPress={() => updateFoundCount(index, 1)} style={styles.miniStep}>
          <Ionicons name="add-circle-outline" size={28} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.statusIcon}>
        <Ionicons 
          name={item.status === 'Match' ? 'checkmark-circle' : 'alert-circle'} 
          size={32} 
          color={item.status === 'Match' ? '#34C759' : '#FF9500'} 
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Audit Report', headerLeft: () => null }} />
      
      <View style={styles.imageComparison}>
        <View style={styles.imageBox}>
          <Text style={styles.imageLabel}>Original</Text>
          <Image source={{ uri: originalImageUri }} style={styles.thumb} />
        </View>
        <View style={styles.imageBox}>
          <Text style={styles.imageLabel}>New Scan</Text>
          <Image source={{ uri: newImageUri }} style={styles.thumb} />
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#5856D6" />
          <Text style={styles.loadingText}>AI is verifying items...</Text>
        </View>
      ) : (
        <View style={styles.resultsBox}>
          <Text style={styles.resultsTitle}>Verify Results</Text>
          <FlatList
            data={results}
            renderItem={renderItem}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={styles.listContent}
          />
          <TouchableOpacity style={styles.finishButton} onPress={() => router.dismissAll()}>
            <Text style={styles.finishText}>Finish Audit</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  imageComparison: {
    flexDirection: 'row',
    padding: 15,
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  imageBox: {
    alignItems: 'center',
  },
  imageLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  thumb: {
    width: 150,
    height: 150,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#5856D6',
    fontWeight: '600',
  },
  resultsBox: {
    flex: 1,
    padding: 20,
  },
  resultsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  listContent: {
    paddingBottom: 20,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  itemCounts: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  correctionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  miniStep: {
    padding: 2,
  },
  foundCountBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 40,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  foundCountText: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  mismatchBadge: {
    backgroundColor: '#FFE5E5',
  },
  mismatchText: {
    color: '#FF3B30',
  },
  statusIcon: {
    width: 35,
    alignItems: 'center',
  },
  finishButton: {
    backgroundColor: '#5856D6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  finishText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
