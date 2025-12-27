import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, SectionList, Image, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FontAwesome } from '@expo/vector-icons';
import { supabase, AuditSession } from '@/lib/supabase';
import { generateAndShareReport, generateAndShareAuditReport } from '@/lib/pdf';

interface InventoryItem {
  id: string;
  created_at: string;
  room_name: string;
  status: string;
  image_path: string;
  ai_analysis: any;
}

interface RoomSection {
  title: string;
  data: InventoryItem[];
}

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sections, setSections] = useState<RoomSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [propertyName, setPropertyName] = useState('Property');
  const [propertyAddress, setPropertyAddress] = useState('');
  
  // Audit History State
  const [pastAudits, setPastAudits] = useState<AuditSession[]>([]);
  const [generatingAuditId, setGeneratingAuditId] = useState<string | null>(null);

  // Edit State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  useEffect(() => {
    fetchPropertyDetails();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
      fetchPastAudits();
    }, [id])
  );

  async function fetchPropertyDetails() {
    const { data } = await supabase.from('properties').select('name, address').eq('id', id).single();
    if (data) {
      setPropertyName(data.name);
      setPropertyAddress(data.address);
      setEditName(data.name);
      setEditAddress(data.address);
    }
  }

  async function fetchPastAudits() {
    console.log('--- Fetching Past Audits ---');
    console.log('Property ID:', id);
    const { data, error } = await supabase
      .from('audit_sessions')
      .select('*')
      .eq('property_id', id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching audits:', error);
    }
    
    console.log('Raw data from DB:', JSON.stringify(data, null, 2));
    
    // Check both 'completed' and any other potential status values
    // Sometimes there might be a typo or case sensitivity issue
    const completed = data?.filter(a => a.status === 'completed') || [];
    console.log('Completed audits count:', completed.length);
    
    setPastAudits(completed);
  }

  async function generateAuditReportForSession(session: AuditSession) {
    try {
      setGeneratingAuditId(session.id);
      
      const { data: records, error: rError } = await supabase
        .from('audit_records')
        .select('*')
        .eq('session_id', session.id);
      if (rError) throw rError;

      const { data: scans, error: sError } = await supabase
        .from('scans')
        .select('*')
        .eq('property_id', id);
      if (sError) throw sError;

      const reportRooms: any[] = [];
      records.forEach(record => {
        const matchingScan = scans.find(s => s.id === record.original_scan_id);
        const roomName = matchingScan?.room_name || 'Unknown Room';
        const analysis = matchingScan?.ai_analysis as any;
        const scanName = Array.isArray(analysis) ? 'Scan' : (analysis?.location || 'Scan');
        
        let roomGroup = reportRooms.find(r => r.roomName === roomName);
        if (!roomGroup) {
          roomGroup = { roomName, scans: [] };
          reportRooms.push(roomGroup);
        }
        
        roomGroup.scans.push({
          scanName,
          originalImageUri: matchingScan ? supabase.storage.from('Photos').getPublicUrl(matchingScan.image_path).data.publicUrl : '',
          auditImageUri: supabase.storage.from('Photos').getPublicUrl(record.audit_image_path).data.publicUrl,
          results: record.comparison_json || []
        });
      });

      await generateAndShareAuditReport({
        propertyName,
        sessionName: session.name,
        rooms: reportRooms
      });
    } catch (error) {
      console.error('Audit report generation failed:', error);
      Alert.alert('Error', 'Failed to generate audit report.');
    } finally {
      setGeneratingAuditId(null);
    }
  }

  async function updateProperty() {
    if (!editName.trim() || !editAddress.trim()) {
      Alert.alert('Error', 'Name and Address are required');
      return;
    }

    try {
      const { error } = await supabase
        .from('properties')
        .update({ name: editName.trim(), address: editAddress.trim() })
        .eq('id', id);

      if (error) throw error;

      setPropertyName(editName.trim());
      setPropertyAddress(editAddress.trim());
      setEditModalVisible(false);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  function groupDataByRoom(data: InventoryItem[]): RoomSection[] {
    const groups: { [key: string]: InventoryItem[] } = {};
    data.forEach(item => {
      const room = (item.room_name || 'Unassigned').trim();
      if (!groups[room]) groups[room] = [];
      groups[room].push(item);
    });
    return Object.keys(groups).sort().map(room => ({ title: room, data: groups[room] }));
  }

  async function fetchInventory() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .eq('property_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching inventory:', error);
      } else {
        setSections(groupDataByRoom(data || []));
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  async function startNewAudit() {
    // Simple prompt for audit session name
    const sessionName = `Audit - ${new Date().toLocaleString(undefined, { 
      year: 'numeric', 
      month: 'numeric', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit'
    })}`;
    
    Alert.alert(
      "Start New Audit",
      `Begin a new audit session for this property?\nName: ${sessionName}`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Start", 
          onPress: async () => {
            try {
              const { data, error } = await supabase
                .from('audit_sessions')
                .insert({
                  property_id: id,
                  name: sessionName,
                  status: 'in_progress'
                })
                .select()
                .single();

              if (error) throw error;
              router.push(`/audit/${data.id}/checklist`);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  }

  async function deleteAllContents() {
    Alert.alert(
      "Delete All Contents",
      "Are you sure you want to delete ALL scans for this property? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete All", 
          style: "destructive", 
          onPress: async () => {
            try {
              const { error } = await supabase.from('scans').delete().eq('property_id', id);
              if (error) throw error;
              fetchInventory();
            } catch (error: any) {
              Alert.alert('Error', `Failed to delete contents: ${error.message}`);
            }
          }
        }
      ]
    );
  }

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
      if (analysis.location) location = analysis.location;
    }

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
      >
        <Image source={{ uri: getImageUrl(item.image_path) }} style={styles.thumbnail} />
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
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Stack.Screen 
        options={{ 
          title: propertyName, 
          headerBackTitle: 'Properties',
          headerShown: true 
        }} 
      />
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="chevron-left" size={20} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{propertyName}</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(true)} style={styles.editIcon}>
              <FontAwesome name="pencil" size={18} color="#007AFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>{propertyAddress}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => router.push({ pathname: '/(tabs)/scan', params: { propertyId: id } })}
          >
            <FontAwesome name="plus" size={20} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => generateAndShareReport(sections)}
            disabled={sections.length === 0}
          >
            <FontAwesome name="file-pdf-o" size={20} color={sections.length === 0 ? '#ccc' : '#007AFF'} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={startNewAudit}
          >
            <FontAwesome name="clipboard" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Property</Text>
            
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Property Name"
            />
            
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={styles.input}
              value={editAddress}
              onChangeText={setEditAddress}
              placeholder="Address"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]} 
                onPress={updateProperty}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading && sections.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No items yet.</Text>
          <TouchableOpacity 
            style={styles.addFirstButton}
            onPress={() => router.push({ pathname: '/(tabs)/scan', params: { propertyId: id } })}
          >
            <Text style={styles.addFirstText}>Add First Item</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          ListFooterComponent={
            <View style={{ paddingBottom: 40 }}>
              {pastAudits.length > 0 && (
                <View style={styles.historySection}>
                  <Text style={styles.historyTitle}>Past Audits</Text>
                  {pastAudits.map(audit => (
                    <View key={audit.id} style={styles.historyRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.auditName}>{audit.name}</Text>
                        <Text style={styles.auditDate}>
                          {new Date(audit.created_at).toLocaleString(undefined, { 
                            year: 'numeric', 
                            month: 'numeric', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit'
                          })}
                        </Text>
                      </View>
                      <TouchableOpacity 
                        onPress={() => generateAuditReportForSession(audit)}
                        disabled={generatingAuditId === audit.id}
                      >
                        {generatingAuditId === audit.id ? (
                          <ActivityIndicator size="small" color="#007AFF" />
                        ) : (
                          <FontAwesome name="file-pdf-o" size={20} color="#007AFF" />
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity style={styles.deleteAllButton} onPress={deleteAllContents}>
                <Text style={styles.deleteAllText}>Delete All Contents</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Custom Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => router.replace('/')}
        >
          <Ionicons name="home-outline" size={24} color="#007AFF" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => router.push({ pathname: '/(tabs)/scan', params: { propertyId: id } })}
        >
          <Ionicons name="camera" size={28} color="#007AFF" />
          <Text style={styles.navText}>Scan Item</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  headerContainer: {
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: { paddingRight: 15 },
  headerTextContainer: { flex: 1 },
  headerActions: { flexDirection: 'row' },
  actionButton: { padding: 10, marginLeft: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: { fontSize: 24, fontWeight: 'bold', marginRight: 8, color: '#000' },
  editIcon: { padding: 8, backgroundColor: '#f0f0f0', borderRadius: 20 },
  subtitle: { fontSize: 14, color: '#666' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', width: '85%', padding: 20, borderRadius: 12, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 5, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
  cancelButton: { backgroundColor: '#f0f0f0' },
  saveButton: { backgroundColor: '#007AFF' },
  cancelButtonText: { color: '#333', fontWeight: 'bold' },
  saveButtonText: { color: 'white', fontWeight: 'bold' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: 'gray', textAlign: 'center', marginBottom: 20 },
  listContent: { padding: 15, paddingBottom: 120 },
  sectionHeader: { backgroundColor: '#f9f9f9', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginBottom: 10, marginTop: 5 },
  sectionHeaderText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  card: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#f0f0f0' },
  thumbnail: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#f0f0f0' },
  cardContent: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  roomName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  date: { fontSize: 14, color: '#999', marginBottom: 8 },
  statsContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusText: { fontSize: 12, color: '#666', backgroundColor: '#f5f5f5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  itemCount: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
  addFirstButton: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8 },
  addFirstText: { color: 'white', fontWeight: 'bold' },
  deleteAllButton: { marginTop: 40, padding: 15, backgroundColor: '#FF3B30', borderRadius: 10, alignItems: 'center' },
  deleteAllText: { color: 'white', fontWeight: 'bold' },
  historySection: { marginTop: 30, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 20 },
  historyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  historyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, marginBottom: 10 },
  auditName: { fontSize: 16, fontWeight: 'bold' },
  auditDate: { fontSize: 12, color: '#666' },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingBottom: 30, // For home indicator
    paddingTop: 10,
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10,
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 4,
  }
});
