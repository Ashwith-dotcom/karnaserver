import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Animated,
  Alert,
  Modal
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LottieView from 'lottie-react-native';
import MapView, { PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FaceVerification from './FaceVerification';

const { width, height } = Dimensions.get('window');
const API_URL = 'http://192.168.0.217:5000/api/owner';

// Dark map style remains the same...

const Home = ({ navigation }) => {
  // Existing state variables remain the same...
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [verifyingDeliveryId, setVerifyingDeliveryId] = useState(null);

  // Existing useEffect and fetchCurrentDelivery remain the same...

  const handleDoorPress = async () => {
    const ownerId = await AsyncStorage.getItem('ownerId');
    if (!currentDelivery) {
      Alert.alert('No Active Delivery', 'There is no delivery in progress');
      return;
    }

    // Show face verification before opening door
    setVerifyingDeliveryId(currentDelivery.id);
    setShowFaceVerification(true);
  };

  const handleFaceVerificationSuccess = async () => {
    setShowFaceVerification(false);
    const ownerId = await AsyncStorage.getItem('ownerId');
    
    try {
      const response = await axios.put(`${API_URL}/deliveries/${verifyingDeliveryId}/opendoor`, {
        ownerId
      });
      
      setDoorOpen(true);
      Animated.timing(buttonPosition, {
        toValue: 50,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } catch (error) {
      console.error('Error opening door:', error);
      Alert.alert('Error', 'Failed to open the robot door');
    }
  };

  // Rest of the component remains the same...

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Existing JSX remains the same... */}
      
      <Modal
        visible={showFaceVerification}
        animationType="slide"
        onRequestClose={() => setShowFaceVerification(false)}
      >
        <FaceVerification
          phoneNumber={currentDelivery?.ownerPhone}
          onSuccess={handleFaceVerificationSuccess}
          onCancel={() => setShowFaceVerification(false)}
        />
      </Modal>
    </SafeAreaView>
  );
};

// Existing styles remain the same...

export default Home;