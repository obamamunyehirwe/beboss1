import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import { CodeScanner } from 'react-native-vision-camera-barcode-scanner';
import { BleManager, Device } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

type ScanProps = { visible: boolean; onClose: () => void; onDetected: (value: string) => void };

export function BarcodeScannerModal({ visible, onClose, onDetected }: ScanProps): React.JSX.Element {
  const { hasPermission, requestPermission } = useCameraPermission();
  useEffect(() => {
    if (visible && !hasPermission) requestPermission().catch(() => undefined);
  }, [visible, hasPermission, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.scanRoot}>
        <View style={styles.scanHeader}>
          <Text style={styles.scanTitle}>Scan product barcode</Text>
          <Pressable onPress={onClose}><Text style={styles.close}>Close</Text></Pressable>
        </View>
        {!hasPermission ? (
          <View style={styles.scanMessage}>
            <Text style={styles.scanText}>Camera access is required to scan product barcodes.</Text>
            <Pressable style={styles.action} onPress={() => requestPermission()}><Text style={styles.actionText}>Allow camera</Text></Pressable>
          </View>
        ) : (
          <CodeScanner
            style={StyleSheet.absoluteFill}
            isActive={visible}
            barcodeFormats={['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'qr-code']}
            onBarcodeScanned={(codes: any[]) => {
              const value = codes?.[0]?.rawValue || codes?.[0]?.displayValue || codes?.[0]?.value;
              if (typeof value === 'string' && value.trim()) { onDetected(value.trim()); onClose(); }
            }}
            onError={(error: any) => Alert.alert('Scanner error', error?.message || 'The barcode scanner could not start.')}
          />
        )}
      </View>
    </Modal>
  );
}

const bleManager = new BleManager();
const SERIAL_SERVICE_IDS = ['0000ffe0', '000018f0', '6e400001'];

export function useBluetoothPrinters(): {
  devices: Array<{ id: string; name: string; device: Device }>;
  scanning: boolean;
  connected: Device | null;
  scan: () => Promise<void>;
  connect: (device: Device) => Promise<void>;
  printText: (text: string) => Promise<void>;
  stopScan: () => void;
} {
  const [devices, setDevices] = useState<Array<{ id: string; name: string; device: Device }>>([]);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState<Device | null>(null);
  useEffect(() => () => { bleManager.stopDeviceScan(); }, []);

  const scan = async (): Promise<void> => {
    setDevices([]);
    setScanning(true);
    bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        setScanning(false);
        Alert.alert('Bluetooth scan failed', error.message);
        return;
      }
      if (device) {
        const name = device.name || device.localName || 'Bluetooth device';
        setDevices(previous => previous.some(item => item.id === device.id) ? previous : [...previous, { id: device.id, name, device }]);
      }
    });
  };
  const stopScan = (): void => { bleManager.stopDeviceScan(); setScanning(false); };
  const connect = async (device: Device): Promise<void> => {
    stopScan();
    const active = await device.connect({ timeout: 12000 });
    await active.discoverAllServicesAndCharacteristics();
    setConnected(active);
  };
  const printText = async (text: string): Promise<void> => {
    if (!connected) throw new Error('Connect a Bluetooth Low Energy receipt printer first.');
    const services = await connected.services();
    for (const service of services) {
      const normalized = service.uuid.toLowerCase().replace(/-/g, '');
      if (!SERIAL_SERVICE_IDS.some(id => normalized.includes(id))) continue;
      const characteristics = await connected.characteristicsForService(service.uuid);
      const writable = characteristics.find(item => item.isWritableWithResponse || item.isWritableWithoutResponse);
      if (!writable) continue;
      const bytes = Buffer.from('\u001b@' + text + '\n\n\n\u001dV\u0001', 'utf8').toString('base64');
      if (writable.isWritableWithoutResponse) {
        await connected.writeCharacteristicWithoutResponseForService(service.uuid, writable.uuid, bytes);
      } else {
        await connected.writeCharacteristicWithResponseForService(service.uuid, writable.uuid, bytes);
      }
      return;
    }
    throw new Error('No compatible BLE ESC/POS serial service was found. Classic serial printers require Apple MFi support or a BLE interface.');
  };
  return { devices, scanning, connected, scan, connect, printText, stopScan };
}
