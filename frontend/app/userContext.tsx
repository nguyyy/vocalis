import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, Alert, Modal, FlatList, Animated } from 'react-native';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';

// Pre-defined options for dropdowns
const TONE_OPTIONS = ['casual', 'formal', 'friendly', 'professional', 'playful'];
const SENTENCE_LENGTH = ['short', 'medium', 'long'];
const EMOTICON_USE = ['never', 'sometimes', 'often', 'always'];
const SPELLING_STYLE = ['american', 'british', 'canadian', 'australian'];
const EMOTION_STYLE = ['neutral', 'expressive', 'enthusiastic', 'reserved'];
const TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'night'];
const ACTIVITY_LEVEL = ['low', 'moderate', 'high'];
const COMM_STYLE = ['direct', 'detailed', 'casual', 'formal'];

function SelectInput({ 
  label, 
  value, 
  options, 
  onChange,
  placeholder = "Select..."
}: { 
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <View style={{ flex: 1, marginRight: 8 }}>
      <TouchableOpacity 
        style={styles.selectInput}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.selectText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        <Text style={styles.dropdownIcon}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={options}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    item === value && styles.optionSelected
                  ]}
                  onPress={() => {
                    onChange(item);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[
                    styles.optionText,
                    item === value && styles.optionTextSelected
                  ]}>
                    {item}
                  </Text>
                  {item === value && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const STORAGE_KEY = '@vocalis_user_profile';

type Profile = {
  age?: string;
  gender?: string;
  nativeLanguage?: string;
  dialect?: string;
  preferredTone?: string;
  typicalSentenceLength?: string;
  timeOfDay?: string;
  activityLevel?: string;
  communicationStyle?: string;
  emoticonUse?: string;
  favoriteWords?: string[];
  topics?: string[];
  routine?: string;
  locationContext?: string;
  relationships?: string[];
  emotionalPreference?: string;
  spellingStyle?: string;
  accessibilityProfile?: string;
  sensoryNeeds?: string;
  ttsPreferences?: string;
  preferredTime?: string;
};

let AsyncStorage: any = null;
try {
  // Optional persistence if the package is installed
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  AsyncStorage = null;
}

export default function UserContextPage() {
  const anim = useRef<Animated.Value>(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 12000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 12000, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const translate = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });

  const [profile, setProfile] = useState<Profile>({
    age: '',
    gender: '',
    nativeLanguage: '',
    dialect: '',
    preferredTone: 'casual',
    typicalSentenceLength: 'short',
    emoticonUse: 'sometimes',
    favoriteWords: [],
    topics: [],
    routine: '',
    locationContext: '',
    relationships: [],
    emotionalPreference: 'neutral',
    spellingStyle: 'american',
    accessibilityProfile: '',
    sensoryNeeds: '',
    ttsPreferences: '',
  });

  const [tagInput, setTagInput] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [relationshipInput, setRelationshipInput] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function saveProfile() {
    try {
      const json = JSON.stringify(profile);
      if (AsyncStorage) {
        await AsyncStorage.setItem(STORAGE_KEY, json);
        Alert.alert('Saved', 'Profile saved locally.');
      } else if (typeof window !== 'undefined' && (window as any).localStorage) {
        (window as any).localStorage.setItem(STORAGE_KEY, json);
        Alert.alert('Saved', 'Profile saved to localStorage (web).');
      } else {
        console.log('Profile (no persistent storage available):', profile);
        Alert.alert('Saved', 'Profile logged to console (persistence not available).');
      }
    } catch (e) {
      console.warn('Failed to save profile', e);
      Alert.alert('Error', 'Failed to save profile. See console.');
    }
  }

  async function loadProfile() {
    try {
      let json: string | null = null;
      if (AsyncStorage) {
        json = await AsyncStorage.getItem(STORAGE_KEY);
      } else if (typeof window !== 'undefined' && (window as any).localStorage) {
        json = (window as any).localStorage.getItem(STORAGE_KEY);
      }
      if (json) {
        setProfile(JSON.parse(json));
      }
    } catch (e) {
      console.warn('Failed to load profile', e);
    }
  }

  function exportProfile() {
    console.log('Exported profile:', profile);
    Alert.alert('Exported', 'Profile JSON logged to console.');
  }

  function setField<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile(prev => ({ ...prev, [key]: value }));
  }

  function addTag(field: 'favoriteWords' | 'topics' | 'relationships', value: string) {
    if (!value || !value.trim()) return;
    setProfile(prev => ({ ...prev, [field]: Array.from(new Set([...(prev as any)[field] || [] , value.trim()])) }));
  }

  function removeTag(field: 'favoriteWords' | 'topics' | 'relationships', value: string) {
    setProfile(prev => ({ ...prev, [field]: ((prev as any)[field] || []).filter((v: string) => v !== value) }));
  }

  function useAsContext() {
    // In real integration this would send the profile to the AI prompt context builder
    console.log('Using profile as context for AI:', profile);
    Alert.alert('Context', 'Profile logged to console for AI use (mock).');
  }

  return (
    <View style={styles.screen}>
      <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 0, transform: [{ translateX: translate }] }] as any}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.15)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.14)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.1)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.06)' }} />
        </View>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      </Animated.View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={styles.container} 
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.navigate('/updatedSearch')}
            accessibilityLabel="Go back to main screen"
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.header}>User Context</Text>
        </View>

      <Text style={styles.sectionTitle}>Demographics</Text>
      <View style={styles.row}>
        <TextInput placeholder="Age" value={profile.age} onChangeText={v => setField('age', v)} style={styles.input} keyboardType="number-pad" />
        <TextInput placeholder="Gender" value={profile.gender} onChangeText={v => setField('gender', v)} style={styles.input} />
      </View>
      <View style={styles.row}>
        <TextInput placeholder="Native language" value={profile.nativeLanguage} onChangeText={v => setField('nativeLanguage', v)} style={styles.input} />
        <TextInput placeholder="Dialect" value={profile.dialect} onChangeText={v => setField('dialect', v)} style={styles.input} />
      </View>

      <Text style={styles.sectionTitle}>Speech / Communication Style</Text>
      <View style={styles.row}>
        <SelectInput
          label="Preferred Tone"
          value={profile.preferredTone || ''}
          options={TONE_OPTIONS}
          onChange={v => setField('preferredTone', v)}
        />
      </View>
      <View style={styles.row}>
        <SelectInput
          label="Sentence Length"
          value={profile.typicalSentenceLength || ''}
          options={SENTENCE_LENGTH}
          onChange={v => setField('typicalSentenceLength', v)}
        />
        <SelectInput
          label="Emoticon Use"
          value={profile.emoticonUse || ''}
          options={EMOTICON_USE}
          onChange={v => setField('emoticonUse', v)}
        />
      </View>

      <Text style={styles.sectionTitle}>Communication Preferences</Text>
      <View style={styles.row}>
        <SelectInput
          label="Communication Style"
          value={profile.communicationStyle || ''}
          options={COMM_STYLE}
          onChange={v => setField('communicationStyle', v)}
        />
      </View>

      <Text style={styles.sectionTitle}>Favorite Words / Expressions</Text>
      <View style={styles.row}>
        <TextInput placeholder="Add word" value={tagInput} onChangeText={setTagInput} style={styles.input} onSubmitEditing={() => { addTag('favoriteWords', tagInput); setTagInput(''); }} />
        <TouchableOpacity style={styles.addBtn} onPress={() => { addTag('favoriteWords', tagInput); setTagInput(''); }}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tagsRow}>{(profile.favoriteWords || []).map(w => (
        <TouchableOpacity key={w} style={styles.tag} onPress={() => removeTag('favoriteWords', w)}>
          <Text style={styles.tagText}>{w} ✕</Text>
        </TouchableOpacity>
      ))}</View>

      <Text style={styles.sectionTitle}>Topics of Interest</Text>
      <View style={styles.row}>
        <TextInput placeholder="Add topic" value={topicInput} onChangeText={setTopicInput} style={styles.input} onSubmitEditing={() => { addTag('topics', topicInput); setTopicInput(''); }} />
        <TouchableOpacity style={styles.addBtn} onPress={() => { addTag('topics', topicInput); setTopicInput(''); }}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tagsRow}>{(profile.topics || []).map(w => (
        <TouchableOpacity key={w} style={styles.tag} onPress={() => removeTag('topics', w)}>
          <Text style={styles.tagText}>{w} ✕</Text>
        </TouchableOpacity>
      ))}</View>

      <Text style={styles.sectionTitle}>Daily Context / Routine</Text>
      <TextInput placeholder="Short note about routine (e.g., school 9-3)" value={profile.routine} onChangeText={v => setField('routine', v)} style={styles.inputFull} />

      <Text style={styles.sectionTitle}>Location Context</Text>
      <TextInput placeholder="Home / School / Work" value={profile.locationContext} onChangeText={v => setField('locationContext', v)} style={styles.inputFull} />

      <Text style={styles.sectionTitle}>Relationship Map</Text>
      <View style={styles.row}>
        <TextInput placeholder="Add person (e.g., Mom)" value={relationshipInput} onChangeText={setRelationshipInput} style={styles.input} onSubmitEditing={() => { addTag('relationships', relationshipInput); setRelationshipInput(''); }} />
        <TouchableOpacity style={styles.addBtn} onPress={() => { addTag('relationships', relationshipInput); setRelationshipInput(''); }}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tagsRow}>{(profile.relationships || []).map(w => (
        <TouchableOpacity key={w} style={styles.tag} onPress={() => removeTag('relationships', w)}>
          <Text style={styles.tagText}>{w} ✕</Text>
        </TouchableOpacity>
      ))}</View>

      <Text style={styles.sectionTitle}>Emotional & Cultural Preferences</Text>
      <View style={styles.row}>
        <SelectInput
          label="Emotional Style"
          value={profile.emotionalPreference || ''}
          options={EMOTION_STYLE}
          onChange={v => setField('emotionalPreference', v)}
        />
        <SelectInput
          label="Spelling Style"
          value={profile.spellingStyle || ''}
          options={SPELLING_STYLE}
          onChange={v => setField('spellingStyle', v)}
        />
      </View>

      <Text style={styles.sectionTitle}>Activity Context</Text>
      <View style={styles.row}>
        <SelectInput
          label="Preferred Time"
          value={profile.preferredTime || ''}
          options={TIME_OF_DAY}
          onChange={v => setField('preferredTime', v)}
        />
        <SelectInput
          label="Activity Level"
          value={profile.activityLevel || ''}
          options={ACTIVITY_LEVEL}
          onChange={v => setField('activityLevel', v)}
        />
      </View>

      <View style={{ height: 16 }} />

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={exportProfile}>
          <Text style={styles.exportText}>Export JSON</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.useBtn} onPress={useAsContext}>
          <Text style={styles.useText}>Use as Context</Text>
        </TouchableOpacity>
      </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  container: { paddingVertical: 20, paddingHorizontal: 24, paddingBottom: 48, alignItems: 'center' },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    padding: 12,
    zIndex: 1,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  header: { 
    color: '#fff', 
    fontSize: 28, 
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  sectionTitle: { color: '#b18cd1', alignSelf: 'flex-start', marginTop: 14, marginBottom: 6, fontWeight: '700' },
  row: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginBottom: 8 },
  input: { backgroundColor: '#27272a', color: '#fff', padding: 10, borderRadius: 10, flex: 1, marginRight: 8, minHeight: 48 },
  inputFull: { backgroundColor: '#27272a', color: '#fff', padding: 10, borderRadius: 10, width: '100%', minHeight: 48 },
  addBtn: { backgroundColor: '#4c1d95', paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minWidth: 64 },
  addBtnText: { color: '#fff', fontWeight: '700' },
  tagsRow: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  tag: { backgroundColor: '#27272a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  tagText: { color: '#fff' },
  actionsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 12 },
  selectInput: {
    backgroundColor: '#27272a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    minHeight: 48,
  },
  selectText: { color: '#fff', flex: 1 },
  placeholder: { color: '#666' },
  dropdownIcon: { color: '#666', fontSize: 12, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#27272a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#4c1d95' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  modalClose: { color: '#a1a1aa', fontSize: 24 },
  optionItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#4c1d95', flexDirection: 'row', alignItems: 'center' },
  optionSelected: { backgroundColor: '#4c1d9533' },
  optionText: { color: '#fff', flex: 1 },
  optionTextSelected: { color: '#b18cd1', fontWeight: '600' },
  checkmark: { color: '#b18cd1', marginLeft: 8 },
  saveBtn: { backgroundColor: '#b18cd1', padding: 12, borderRadius: 12, flex: 1, marginRight: 8, alignItems: 'center' },
  saveText: { color: '#000', fontWeight: '700' },
  exportBtn: { backgroundColor: '#2d0b4e', padding: 12, borderRadius: 12, flex: 1, marginRight: 8, alignItems: 'center' },
  exportText: { color: '#fff', fontWeight: '700' },
  useBtn: { backgroundColor: '#18181b', padding: 12, borderRadius: 12, flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#2d0b4e' },
  useText: { color: '#fff', fontWeight: '700' },
});
