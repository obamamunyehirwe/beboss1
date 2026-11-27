import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { pick, keepLocalCopy, types as documentTypes, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import {
  Branch, CartLine, CheckoutInput, Customer, HeldCart, Permissions, Product, Role, Sale, ShopProfile, Staff,
  StoreSnapshot, ROLE_PERMISSIONS
} from './src/core/types';
import {
  adjustStock, archiveBranch, authenticate, cancelStockTransfer, checkout, confirmStockTransfer, deleteCustomer,
  deleteHeldCart, deleteProduct, deletePurchaseRecord, buildIosCloudSnapshot, initializeStore,
  listArchivedCustomers, listArchivedProducts, loadSnapshot, markIosOutboxFailed, markIosOutboxSynced,
  mergeIosCloudSnapshots, recordCustomerPayment, recordPurchase, recordStockTransfer, registerOwner,
  restoreCustomer, restoreEncryptedBackupData, restoreProduct, reverseSale, saveBranch, saveCustomer,
  saveHeldCart, saveProduct, saveShopSettings, saveStaff, setBranchOperationalStatus,
  storeDiagnostics, prepareEnrolledDeviceStaff, quickCustomSale, redeemBB3Voucher, listRedeemedVouchers
} from './src/storage/repository';
import { BarcodeScannerModal, useBluetoothPrinters } from './src/services/hardware';
import { decryptBackupFile, exportEncryptedBackup } from './src/services/backup';
import { enableBiometricUnlock, requireBiometricUnlock, biometricAvailable } from './src/services/biometrics';
import {
  checkSubscriptionPaymentStatus, cloudConfigured, cloudSessionState, createSubscriptionCheckout, downloadIosCloudSnapshots, enrollIosDevice,
  getIosCloudSyncStatus, getIosDeviceCredential, requestOwnerPhoneVerification,
  requestSecureIosSyncReadiness, signOutCloud, uploadIosCloudSnapshot, verifyOwnerPhoneCode
} from './src/services/cloud';
import { calculateSubscriptionQuote, isSubscriptionActive, roundMoney } from './src/core/domain';
import { buildReorderSuggestions } from './src/core/forecast';
import { exportInventoryCsv, exportSalesCsv } from './src/services/reports';

type Screen = 'dashboard' | 'pos' | 'inventory' | 'customers' | 'sales' | 'reports' | 'purchases' | 'branches' | 'staff' | 'sync' | 'subscription' | 'settings';
type ModalName = 'product' | 'adjust' | 'customer' | 'payment' | 'checkout' | 'quickSale' | 'purchase' | 'branch' | 'transfer' | 'staff' | 'settings' | 'scanner' | 'backup' | null;

const money = (value: number, symbol = 'RWF') =>
  symbol + ' ' + roundMoney(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const initialProfileForm = {
  shopName: '', ownerName: '', username: '', phone: '', pin: '', password: '',
  address: 'Rwanda', businessType: 'sector_retail', currencyCode: 'RWF', currencySymbol: 'RWF'
};

function AppRoot(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [modal, setModal] = useState<ModalName>(null);
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [actor, setActor] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [registered, setRegistered] = useState(false);
  const [profileForm, setProfileForm] = useState(initialProfileForm);
  const [loginName, setLoginName] = useState('');
  const [loginSecret, setLoginSecret] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerChoice, setCustomerChoice] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitMomo, setSplitMomo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [analyticsPeriod, setAnalyticsPeriod] = useState('THIS_MONTH');
  const [reportBranch, setReportBranch] = useState('ALL');
  const [archivedProducts, setArchivedProducts] = useState<Product[]>([]);
  const [archivedCustomers, setArchivedCustomers] = useState<Customer[]>([]);
  const [showArchivedProducts, setShowArchivedProducts] = useState(false);
  const [showArchivedCustomers, setShowArchivedCustomers] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedTransferId, setSelectedTransferId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics] = useState({ pending: 0, failed: 0, localRows: 0, lastSyncAt: 0, subscriptionActive: false });
  const [online, setOnline] = useState(false);
  const [cloudAuthenticated, setCloudAuthenticated] = useState(false);
  const [ownerOtpUsername, setOwnerOtpUsername] = useState('');
  const [ownerOtpPhone, setOwnerOtpPhone] = useState('');
  const [ownerOtp, setOwnerOtp] = useState('');
  const [ownerJoinCode, setOwnerJoinCode] = useState('');
  const [deviceLocalPin, setDeviceLocalPin] = useState('');
  const [deviceLocalPassword, setDeviceLocalPassword] = useState('');
  const [iosDeviceEnrolled, setIosDeviceEnrolled] = useState(false);
  const [iosSyncReady, setIosSyncReady] = useState(false);
  const [iosSyncRole, setIosSyncRole] = useState('');
  const [latestCloudUpdatedAt, setLatestCloudUpdatedAt] = useState(0);
  const [enrolledDeviceSummary, setEnrolledDeviceSummary] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [subscriptionMonths, setSubscriptionMonths] = useState<'1' | '3' | '6' | '12'>('1');
  const [subscriptionGateway, setSubscriptionGateway] = useState<'mtn_momo' | 'flutterwave' | 'stripe'>('mtn_momo');
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [paymentRequestId, setPaymentRequestId] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [redeemedVouchers, setRedeemedVouchers] = useState<Array<{fingerprint:string;voucherCode:string;planName:string;daysAdded:number;verifiedAmountRwf:number;redeemedAt:number}>>([]);
  const [paymentRequestMessage, setPaymentRequestMessage] = useState('');
  const [paymentRequestStatus, setPaymentRequestStatus] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [backupMode, setBackupMode] = useState<'EXPORT' | 'RESTORE'>('EXPORT');
  const [showScanner, setShowScanner] = useState(false);
  const printer = useBluetoothPrinters();

  const profile = snapshot?.profile || null;
  const currency = profile?.currencySymbol || 'RWF';

  const reload = useCallback(async (userId?: string | null) => {
    const next = await loadSnapshot(userId === undefined ? actor?.id || null : userId);
    setSnapshot(next);
    return next;
  }, [actor?.id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initializeStore();
        const initial = await loadSnapshot(null);
        if (!mounted) return;
        setSnapshot(initial);
        setRegistered(!!initial.profile);
        if (initial.profile) setLoginName(initial.profile.username);
        const enrolled = await getIosDeviceCredential();
        if (mounted && enrolled) {
          setIosDeviceEnrolled(true);
          setLoginName(enrolled.assignedUsername);
          setEnrolledDeviceSummary(enrolled.shopName + ' · ' + enrolled.role + ' · ' + (enrolled.branchName || 'Assigned branch'));
        }
      } catch (caught: any) {
        if (mounted) setError(caught?.message || 'The encrypted BeBoss database could not be opened.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    const unsubscribe = NetInfo.addEventListener(state => setOnline(!!state.isConnected && !!state.isInternetReachable));
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const run = useCallback(async (action: () => Promise<void>, successMessage = 'Saved successfully.') => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await reload(actor?.id || null);
      setNotice(successMessage);
      return true;
    } catch (caught: any) {
      setError(caught?.message || 'The operation could not be completed.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [actor?.id, reload]);

  const doRegister = async () => {
    const missing = !profileForm.shopName.trim() || !profileForm.ownerName.trim() ||
      !profileForm.username.trim() || !profileForm.phone.trim() || !profileForm.pin.trim() || !profileForm.password.trim();
    if (missing) { setError('Complete the shop, owner, phone, PIN and password fields.'); return; }
    setBusy(true);
    setError('');
    try {
      const owner = await registerOwner(profileForm);
      setActor(owner);
      await reload(owner.id);
      setRegistered(true);
      setScreen('dashboard');
      setNotice('Your encrypted BeBoss workspace has been created on this iPhone.');
    } catch (caught: any) {
      setError(caught?.message || 'Shop registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const doLogin = async () => {
    if (!loginSecret.trim()) { setError('Enter your staff PIN or password.'); return; }
    setBusy(true);
    setError('');
    try {
      const enrolled = await getIosDeviceCredential();
      if (enrolled && loginName.trim().toLowerCase() !== enrolled.assignedUsername) {
        throw new Error('This iPhone is assigned to @' + enrolled.assignedUsername + ' (' + enrolled.role + '). Other local staff accounts cannot sign in on this device.');
      }
      const user = await authenticate(loginName, loginSecret);
      if (enrolled && (user.id !== enrolled.assignedUserId || user.role !== enrolled.role ||
          user.branchId !== enrolled.branchId)) {
        setActor(null);
        throw new Error('The local account does not match this iPhone\'s server-assigned user, role and branch. Rebind the assigned staff account before signing in.');
      }
      setActor(user);
      setLoginSecret('');
      await reload(user.id);
      setScreen('dashboard');
      setNotice('Welcome back, ' + user.name + '.');
    } catch (caught: any) {
      setError(caught?.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!actor) return;
    reload(actor.id).catch(() => undefined);
    storeDiagnostics().then(setDiagnostics).catch(() => undefined);
    cloudSessionState().then(state => setCloudAuthenticated(state.authenticated)).catch(() => setCloudAuthenticated(false));
  }, [actor, reload]);

  const permissions = actor;
  const visibleProducts = useMemo(() => (snapshot?.products || []).filter(product => {
    const branchAllowed = !actor?.branchId || product.branchId === actor.branchId;
    const categoryAllowed = category === 'All' || product.category.toLowerCase() === category.toLowerCase();
    const query = search.trim().toLowerCase();
    const matches = !query || product.name.toLowerCase().includes(query) ||
      product.barcode.toLowerCase().includes(query) || product.category.toLowerCase().includes(query);
    return branchAllowed && categoryAllowed && matches;
  }), [snapshot?.products, actor?.branchId, category, search]);

  const cartProducts = useMemo(() => cart.map(line => {
    const product = snapshot?.products.find(item => item.id === line.productId);
    return product ? { product, line } : null;
  }).filter((value): value is { product: Product; line: CartLine } => !!value), [cart, snapshot?.products]);

  const cartSubtotal = cartProducts.reduce((sum, item) => sum + item.product.sellingPrice * item.line.quantity, 0);
  const checkoutTotal = Math.max(0, cartSubtotal - (Number(discount) || 0));

  const addToCart = (product: Product) => {
    if (product.quantityInStock <= 0) { setError(product.name + ' is out of stock.'); return; }
    setCart(previous => {
      const existing = previous.find(item => item.productId === product.id);
      if (!existing) return [...previous, { productId: product.id, quantity: 1 }];
      if (existing.quantity + 1 > product.quantityInStock) {
        setError('Available stock for ' + product.name + ' is ' + product.quantityInStock + '.');
        return previous;
      }
      return previous.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
    });
  };

  const changeCartQuantity = (product: Product, delta: number) => {
    setCart(previous => previous.map(line => line.productId === product.id
      ? { ...line, quantity: Math.max(0, Math.min(product.quantityInStock, line.quantity + delta)) }
      : line).filter(line => line.quantity > 0));
  };

  const openNewProduct = (product?: Product) => {
    setEditingProduct(product || null);
    setForm({
      name: product?.name || '', category: product?.category || 'General', barcode: product?.barcode || '',
      unit: product?.unit || 'pcs', branchId: product?.branchId || actor?.branchId || snapshot?.branches[0]?.id || 'main_branch',
      costPrice: String(product?.costPrice ?? 0), sellingPrice: String(product?.sellingPrice ?? ''),
      quantityInStock: String(product?.quantityInStock ?? 0), lowStockThreshold: String(product?.lowStockThreshold ?? profile?.lowStockThresholdDefault ?? 5)
    });
    setModal('product');
  };

  const saveProductForm = async () => {
    const price = Number(form.sellingPrice);
    const costPrice = Number(form.costPrice || 0);
    const stock = Number(form.quantityInStock);
    const threshold = Number(form.lowStockThreshold || 5);
    if (!form.name?.trim() || !Number.isFinite(price) || !Number.isFinite(stock)) {
      setError('Enter a product name, valid selling price and stock quantity.'); return;
    }
    const ok = await run(async () => {
      await saveProduct({
        id: editingProduct?.id, name: form.name, category: form.category, barcode: form.barcode,
        unit: form.unit, branchId: form.branchId, costPrice, sellingPrice: price,
        quantityInStock: stock, lowStockThreshold: threshold
      }, actor!);
      setModal(null);
    }, editingProduct ? 'Product updated.' : 'Product added.');
    if (ok) setEditingProduct(null);
  };

  const openCustomer = (customer?: Customer) => {
    setEditingCustomer(customer || null);
    setForm({
      name: customer?.name || '', phone: customer?.phone || '', email: customer?.email || '',
      address: customer?.address || '', city: customer?.city || '', category: customer?.category || 'Regular Customer',
      creditLimit: String(customer?.creditLimit ?? 500000), notes: customer?.notes || ''
    });
    setModal('customer');
  };

  const saveCustomerForm = async () => {
    if (!form.name?.trim()) { setError('Customer name is required.'); return; }
    const ok = await run(async () => {
      await saveCustomer({
        id: editingCustomer?.id, name: form.name, phone: form.phone, email: form.email,
        address: form.address, city: form.city, category: form.category, creditLimit: Number(form.creditLimit || 0), notes: form.notes
      }, actor!);
      setModal(null);
    }, 'Customer record saved.');
    if (ok) setEditingCustomer(null);
  };

  const finishCheckout = async () => {
    const discountAmount = Number(discount || 0);
    const splitCashAmount = Number(splitCash || 0);
    const splitMomoAmount = Number(splitMomo || 0);
    const amountPaid = paymentMethod === 'CREDIT_DEBT' ? 0
      : paymentMethod === 'SPLIT' ? splitCashAmount + splitMomoAmount
      : Number(paid || checkoutTotal);
    if (!Number.isFinite(discountAmount) || !Number.isFinite(amountPaid) ||
        (paymentMethod === 'SPLIT' && (!Number.isFinite(splitCashAmount) || !Number.isFinite(splitMomoAmount)))) {
      setError('Enter valid discount and payment amounts.'); return;
    }
    const input: CheckoutInput = {
      items: cart, customerId: customerChoice || null, discountAmount, amountPaid,
      paymentMethod: paymentMethod === 'CREDIT_DEBT' ? 'DEBT' : paymentMethod,
      paymentBreakdown: paymentMethod === 'SPLIT'
        ? [{ method: 'CASH', amount: splitCashAmount }, { method: 'MOMO', amount: splitMomoAmount }]
        : undefined,
      notes: '', branchId: actor?.branchId || snapshot?.branches[0]?.id || 'main_branch'
    };
    const ok = await run(async () => {
      const sale = await checkout(input, actor!);
      setReceiptNumber(sale.receiptNumber);
      setCart([]);
      setCustomerChoice('');
      setDiscount('0');
      setPaid('');
      setSplitCash('');
      setSplitMomo('');
      setPaymentMethod('CASH');
      setModal(null);
      Alert.alert('Sale completed', sale.receiptNumber + '\nTotal: ' + money(sale.totalAmount, currency) + '\nPaid: ' + money(sale.amountPaid, currency) + '\nBalance: ' + money(sale.totalAmount - sale.amountPaid, currency));
    }, 'Sale committed locally and added to the secure sync outbox.');
    if (!ok) return;
  };

  const openQuickSale = () => {
    setForm({ description: '', amount: '', paymentMethod: 'CASH' });
    setModal('quickSale');
  };

  const saveQuickSale = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a quick-sale amount greater than zero.');
      return;
    }
    const ok = await run(async () => {
      const sale = await quickCustomSale(form.description || 'Custom Quick Item', amount, form.paymentMethod || 'CASH', actor!);
      setReceiptNumber(sale.receiptNumber);
      setModal(null);
      Alert.alert('Quick sale completed', sale.receiptNumber + '\nTotal: ' + money(sale.totalAmount, currency) + '\nProfit: ' + money(sale.totalProfit, currency));
    }, 'Quick custom sale recorded.');
    if (ok) setForm({});
  };

  const openStockAdjustment = (product: Product) => {
    setSelectedProductId(product.id);
    setForm({ quantity: '', reason: 'Stock received' });
    setModal('adjust');
  };

  const holdCurrentCart = () => {
    if (!actor || !cart.length) return;
    Alert.prompt(
      'Hold this sale',
      'Add a label so this basket can be found and resumed later.',
      label => {
        run(async () => {
          await saveHeldCart({
            label: label || '',
            items: cart,
            customerId: customerChoice,
            discountAmount: Number(discount || 0),
            paymentMethod,
            amountPaid: Number(paid || 0),
            splitCashAmount: Number(splitCash || 0),
            splitMomoAmount: Number(splitMomo || 0),
            notes: '',
            branchId: actor.branchId || snapshot?.branches.find(branch => branch.isMainBranch)?.id || 'main_branch'
          }, actor);
          setCart([]);
          setCustomerChoice('');
          setDiscount('0');
          setPaid('');
          setSplitCash('');
          setSplitMomo('');
          setPaymentMethod('CASH');
        }, 'Sale held securely on this iPhone.');
      },
      'plain-text'
    );
  };

  const resumeHeldCart = async (held: HeldCart) => {
    if (cart.length) {
      setError('Hold or clear the current basket before resuming another held sale.');
      return;
    }
    const ok = await run(async () => { await deleteHeldCart(held.id, actor!); }, 'Held sale resumed.');
    if (!ok) return;
    setCart(held.items);
    setCustomerChoice(held.customerId);
    setDiscount(String(held.discountAmount));
    setPaymentMethod(held.paymentMethod);
    setPaid(String(held.amountPaid));
    setSplitCash(String(held.splitCashAmount));
    setSplitMomo(String(held.splitMomoAmount));
    setScreen('pos');
  };

  const saveStockAdjustment = async () => {
    const amount = Number(form.quantity);
    if (!Number.isFinite(amount) || amount === 0) { setError('Enter a non-zero stock quantity change.'); return; }
    await run(async () => {
      await adjustStock(selectedProductId, amount, form.reason || 'Manual adjustment', actor!);
      setModal(null);
    }, 'Stock adjustment recorded.');
  };

  const openPayment = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setForm({ amount: String(customer.debtBalance), method: 'CASH', note: '' });
    setModal('payment');
  };

  const saveCustomerPayment = async () => {
    const amount = Number(form.amount);
    await run(async () => {
      await recordCustomerPayment(selectedCustomerId, amount, form.method, form.note || '', actor!);
      setModal(null);
    }, 'Customer payment recorded.');
  };

  const openPurchase = (product?: Product) => {
    setForm({
      productId: product?.id || snapshot?.products[0]?.id || '', quantity: '1',
      unitCostPrice: String(product?.costPrice || ''), newSellingPrice: '', supplierName: '',
      supplierPhone: '', paymentStatus: 'PAID_CASH', invoiceNumber: '', notes: '',
      branchId: actor?.branchId || snapshot?.branches[0]?.id || 'main_branch'
    });
    setModal('purchase');
  };

  const savePurchaseForm = async () => {
    await run(async () => {
      await recordPurchase({
        productId: form.productId, quantity: Number(form.quantity), unitCostPrice: Number(form.unitCostPrice),
        newSellingPrice: form.newSellingPrice ? Number(form.newSellingPrice) : undefined,
        supplierName: form.supplierName || '', supplierPhone: form.supplierPhone || '',
        paymentStatus: form.paymentStatus || 'PAID_CASH', invoiceNumber: form.invoiceNumber || '',
        notes: form.notes || '', branchId: form.branchId
      }, actor!);
      setModal(null);
    }, 'Purchase and stock inflow recorded.');
  };

  const openBranch = (branch?: Branch) => {
    setEditingBranch(branch || null);
    setForm({
      name: branch?.name || '', code: branch?.code || '', address: branch?.address || '',
      phone: branch?.phone || '', managerName: branch?.managerName || '',
      locationType: branch?.locationType || 'STORE', notes: branch?.notes || '',
      operationalStatus: branch?.operationalStatus || 'OPEN',
      isMainBranch: String(branch?.isMainBranch ?? false),
      isActive: String(branch?.isActive ?? true)
    });
    setModal('branch');
  };
  const saveBranchForm = async () => {
    await run(async () => {
      await saveBranch({
        id: editingBranch?.id, name: form.name, code: form.code, address: form.address,
        phone: form.phone, managerName: form.managerName, locationType: form.locationType as any,
        operationalStatus: (form.operationalStatus || 'OPEN') as Branch['operationalStatus'],
        isMainBranch: form.isMainBranch === 'true',
        isActive: form.isActive !== 'false',
        notes: form.notes
      }, actor!);
      setModal(null);
    }, 'Branch saved.');
  };

  const openTransfer = () => {
    const branches = snapshot?.branches.filter(item => item.isActive) || [];
    setForm({
      productId: snapshot?.products[0]?.id || '', fromBranchId: actor?.branchId || branches[0]?.id || '',
      toBranchId: branches.find(item => item.id !== (actor?.branchId || branches[0]?.id))?.id || '',
      quantity: '1', notes: ''
    });
    setModal('transfer');
  };
  const saveTransfer = async () => {
    await run(async () => {
      await recordStockTransfer({
        productId: form.productId, fromBranchId: form.fromBranchId,
        toBranchId: form.toBranchId, quantity: Number(form.quantity), notes: form.notes || ''
      }, actor!);
      setModal(null);
    }, 'Stock transfer created. The receiving branch must confirm receipt.');
  };
  const receiveTransfer = (transferId: string) => Alert.alert('Stock transfer', 'Choose the inventory action for this in-transit transfer.', [
    { text: 'Keep in transit', style: 'cancel' },
    { text: 'Cancel and restore source stock', style: 'destructive', onPress: () => {
      Alert.prompt(
        'Cancel stock transfer',
        'Enter a reason. The quantity will be restored to the sending branch.',
        reason => {
          if (!reason?.trim()) { setError('A cancellation reason is required.'); return; }
          run(async () => cancelStockTransfer(transferId, reason, actor!), 'Transfer cancelled and source stock restored.');
        },
        'plain-text'
      );
    }},
    { text: 'Confirm receipt', onPress: () => run(async () => confirmStockTransfer(transferId, actor!), 'Transfer received into a branch-specific product record.') }
  ]);

  const openStaff = (staff?: Staff) => {
    setEditingStaff(staff || null);
    const role = staff?.role || 'CASHIER';
    const permissions = staff || ROLE_PERMISSIONS[role];
    setForm({
      name: staff?.name || '', username: staff?.username || '', phone: staff?.phone || '',
      role, branchId: staff?.branchId || actor?.branchId || '',
      pin: '', password: '', isActive: String(staff?.isActive ?? true),
      permission_canSellPOS: String(permissions.canSellPOS),
      permission_canApplyDiscounts: String(permissions.canApplyDiscounts),
      permission_canManageInventory: String(permissions.canManageInventory),
      permission_canViewCostAndProfit: String(permissions.canViewCostAndProfit),
      permission_canViewAnalytics: String(permissions.canViewAnalytics),
      permission_canManageCustomers: String(permissions.canManageCustomers),
      permission_canCollectDebt: String(permissions.canCollectDebt),
      permission_canDeleteRecords: String(permissions.canDeleteRecords),
      permission_canExportReports: String(permissions.canExportReports),
      permission_canManageCollaborators: String(permissions.canManageCollaborators),
      permission_canManageShopSettings: String(permissions.canManageShopSettings),
      permission_canExportImportData: String(permissions.canExportImportData)
    });
    setModal('staff');
  };
  const setStaffRole = (roleInput: string) => {
    const role = roleInput as Role;
    const defaults = ROLE_PERMISSIONS[role];
    setForm(previous => ({
      ...previous,
      role,
      permission_canSellPOS: String(defaults.canSellPOS),
      permission_canApplyDiscounts: String(defaults.canApplyDiscounts),
      permission_canManageInventory: String(defaults.canManageInventory),
      permission_canViewCostAndProfit: String(defaults.canViewCostAndProfit),
      permission_canViewAnalytics: String(defaults.canViewAnalytics),
      permission_canManageCustomers: String(defaults.canManageCustomers),
      permission_canCollectDebt: String(defaults.canCollectDebt),
      permission_canDeleteRecords: String(defaults.canDeleteRecords),
      permission_canExportReports: String(defaults.canExportReports),
      permission_canManageCollaborators: String(defaults.canManageCollaborators),
      permission_canManageShopSettings: String(defaults.canManageShopSettings),
      permission_canExportImportData: String(defaults.canExportImportData)
    }));
  };

  const saveStaffForm = async () => {
    const permissions: Permissions = {
      canSellPOS: form.permission_canSellPOS === 'true',
      canApplyDiscounts: form.permission_canApplyDiscounts === 'true',
      canManageInventory: form.permission_canManageInventory === 'true',
      canViewCostAndProfit: form.permission_canViewCostAndProfit === 'true',
      canViewAnalytics: form.permission_canViewAnalytics === 'true',
      canManageCustomers: form.permission_canManageCustomers === 'true',
      canCollectDebt: form.permission_canCollectDebt === 'true',
      canDeleteRecords: form.permission_canDeleteRecords === 'true',
      canExportReports: form.permission_canExportReports === 'true',
      canManageCollaborators: form.permission_canManageCollaborators === 'true',
      canManageShopSettings: form.permission_canManageShopSettings === 'true',
      canExportImportData: form.permission_canExportImportData === 'true'
    };
    await run(async () => {
      await saveStaff({
        id: editingStaff?.id, name: form.name, username: form.username, phone: form.phone,
        role: form.role as Role, branchId: form.branchId, pin: form.pin, password: form.password,
        isActive: form.isActive !== 'false', permissions
      }, actor!);
      setModal(null);
    }, 'Staff account and individual permissions saved.');
  };

  const openSettings = () => {
    setForm({
      shopName: profile?.shopName || '', ownerName: profile?.ownerName || '', phone: profile?.phone || '',
      address: profile?.address || '', businessType: profile?.businessType || '', currencyCode: profile?.currencyCode || 'RWF',
      currencySymbol: profile?.currencySymbol || 'RWF', taxRate: String(profile?.taxRate || 0),
      receiptHeader: profile?.receiptHeader || '', receiptFooter: profile?.receiptFooter || '',
      lowStockThresholdDefault: String(profile?.lowStockThresholdDefault || 5)
    });
    setModal('settings');
  };
  const saveSettingsForm = async () => {
    await run(async () => {
      await saveShopSettings({
        shopName: form.shopName, ownerName: form.ownerName, phone: form.phone, address: form.address,
        businessType: form.businessType, currencyCode: form.currencyCode, currencySymbol: form.currencySymbol,
        taxRate: Number(form.taxRate || 0), receiptHeader: form.receiptHeader, receiptFooter: form.receiptFooter,
        lowStockThresholdDefault: Number(form.lowStockThresholdDefault || 5)
      }, actor!);
      setModal(null);
    }, 'Shop settings saved.');
  };

  const refreshIosSyncStatus = async () => {
    const [stats, cloud] = await Promise.all([storeDiagnostics(), cloudSessionState()]);
    setDiagnostics(stats);
    setCloudAuthenticated(cloud.authenticated);
    setIosDeviceEnrolled(cloud.enrolledDevice);
    if (!cloud.enrolledDevice) {
      setIosSyncReady(false);
      setIosSyncRole('');
      setLatestCloudUpdatedAt(0);
      return;
    }
    const [enrolled, status] = await Promise.all([getIosDeviceCredential(), getIosCloudSyncStatus()]);
    setIosSyncReady(status.ready);
    setIosSyncRole(status.role);
    setLatestCloudUpdatedAt(status.latestUpdatedAt);
    if (enrolled) setEnrolledDeviceSummary(enrolled.shopName + ' · ' + enrolled.role + ' · ' + (enrolled.branchName || 'Assigned branch'));
  };

  const openSyncScreen = async () => {
    try { await refreshIosSyncStatus(); }
    catch (caught: any) { setError(caught?.message || 'Unable to load sync status.'); }
    setScreen('sync');
  };

  const synchronizeIosNow = async () => {
    if (!actor) { setError('Unlock this iPhone with an active local staff account before synchronizing.'); return; }
    if (!online) { setError('This iPhone is offline. Your business changes remain saved locally; reconnect and retry cloud sync.'); return; }
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    let inFlightOutboxIds: string[] = [];
    try {
      const status = await getIosCloudSyncStatus();
      if (!status.ready) throw new Error(status.reason);
      if (!status.canUpload) throw new Error('This iPhone is not authorised to upload shop changes.');
      let completed = false;
      for (let attempt = 0; attempt < 3 && !completed; attempt += 1) {
        const local = await buildIosCloudSnapshot(actor);
        inFlightOutboxIds = local.outboxIds;
        const uploaded = await uploadIosCloudSnapshot(local.snapshot, local.expectedUpdatedAt);
        if (!uploaded.accepted) {
          if (!uploaded.conflict) throw new Error(uploaded.message || 'The cloud did not accept the iPhone snapshot.');
          const latest = await downloadIosCloudSnapshots();
          if (latest.snapshots.length) {
            await mergeIosCloudSnapshots(latest.snapshots, actor);
            await reload(actor.id);
          }
          await markIosOutboxSynced([], Date.now(), latest.latestUpdatedAt);
          setLatestCloudUpdatedAt(latest.latestUpdatedAt);
          if (attempt === 2) {
            throw new Error('Another device kept changing the shop during synchronization. Local changes are preserved; retry once the other device finishes.');
          }
          continue;
        }

        // Confirm the upload by reading back a complete, HMAC-verified generation.
        const confirmed = await downloadIosCloudSnapshots();
        if (confirmed.snapshots.length) {
          await mergeIosCloudSnapshots(confirmed.snapshots, actor);
        }
        await markIosOutboxSynced(local.outboxIds, Date.now(), confirmed.latestUpdatedAt || uploaded.latestUpdatedAt);
        await reload(actor.id);
        const diagnosticsNow = await storeDiagnostics();
        setDiagnostics(diagnosticsNow);
        setLatestCloudUpdatedAt(confirmed.latestUpdatedAt || uploaded.latestUpdatedAt);
        setNotice(
          'Cloud synchronization completed. ' + uploaded.chunkCount + ' signed chunks were accepted; ' +
          diagnosticsNow.pending + ' local changes remain queued.'
        );
        completed = true;
      }
      await refreshIosSyncStatus();
    } catch (caught: any) {
      if (inFlightOutboxIds.length) {
        try { await markIosOutboxFailed(inFlightOutboxIds, caught?.message || 'Cloud synchronization failed.'); }
        catch { /* Keep the original network/authorization error visible. */ }
      }
      try { setDiagnostics(await storeDiagnostics()); } catch { /* Keep the primary error visible. */ }
      setError(caught?.message || 'The iPhone could not complete cloud synchronization. Local business records have been retained.');
    } finally {
      setBusy(false);
    }
  };

  const requestOtp = async () => {
    if (!ownerOtpUsername.trim() || !ownerOtpPhone.trim()) {
      setError('Enter the registered shop-owner username and phone number.');
      return;
    }
    setBusy(true); setError('');
    try {
      await requestOwnerPhoneVerification(ownerOtpPhone);
      setOtpRequested(true);
      setNotice('Verification SMS requested. Enter the code sent to the registered owner number.');
    } catch (caught: any) { setError(caught?.message || 'SMS verification could not be requested.'); }
    finally { setBusy(false); }
  };
  const confirmOtp = async () => {
    setBusy(true); setError('');
    try {
      await verifyOwnerPhoneCode(ownerOtpPhone, ownerOtp);
      setCloudAuthenticated(true);
      setOtpRequested(false);
      const readiness = await requestSecureIosSyncReadiness();
      setIosSyncReady(readiness.ready);
      if (readiness.status) {
        setIosSyncRole(readiness.status.role);
        setLatestCloudUpdatedAt(readiness.status.latestUpdatedAt);
      }
      setNotice('Owner phone verified. ' + readiness.reason);
    } catch (caught: any) { setError(caught?.message || 'Phone verification failed.'); }
    finally { setBusy(false); }
  };

  const enrollThisIphone = async () => {
    if (!ownerOtpUsername.trim() || !ownerOtpPhone.trim() || !ownerJoinCode.trim()) {
      setError('Enter the owner username, registered phone and invitation code from the enrolled owner terminal.');
      return;
    }
    if (!deviceLocalPin.trim() || !deviceLocalPassword.trim()) {
      setError('Create a local PIN and password for this iPhone. These credentials are stored only on this device.');
      return;
    }
    setBusy(true); setError('');
    try {
      const enrolled = await enrollIosDevice(ownerOtpUsername, ownerOtpPhone, ownerJoinCode, 'BeBoss iPhone');
      const user = await prepareEnrolledDeviceStaff({
        shopId: enrolled.shopId,
        ownerUsername: enrolled.ownerUsername,
        assignedUserId: enrolled.assignedUserId,
        assignedUsername: enrolled.assignedUsername,
        assignedUserName: enrolled.assignedUserName,
        assignedPhone: enrolled.assignedPhone,
        role: enrolled.role,
        branchId: enrolled.branchId,
        branchName: enrolled.branchName
      }, {
        pin: deviceLocalPin,
        password: deviceLocalPassword
      });
      setActor(user);
      setLoginName(user.username);
      setDeviceLocalPin('');
      setDeviceLocalPassword('');
      setOwnerJoinCode('');
      setIosDeviceEnrolled(true);
      setEnrolledDeviceSummary(enrolled.shopName + ' · @' + user.username + ' · ' +
        user.role + ' · ' + (user.branchName || 'Assigned branch'));
      await reload(user.id);
      const readiness = await requestSecureIosSyncReadiness();
      setIosSyncReady(readiness.ready);
      if (readiness.status) {
        setIosSyncRole(readiness.status.role);
        setLatestCloudUpdatedAt(readiness.status.latestUpdatedAt);
      }
      setNotice('iPhone enrollment and local staff binding completed. This terminal can sign in only as @' +
        user.username + ' (' + user.role + '). ' + readiness.reason);
    } catch (caught: any) { setError(caught?.message || 'iPhone enrollment or local staff provisioning failed.'); }
    finally { setBusy(false); }
  };

  const saveBackup = async () => {
    if (!snapshot || !backupPassword.trim()) { setError('Set a backup password first.'); return; }
    setBusy(true); setError('');
    try {
      requireRoleFeature('canExportImportData', 'export backups');
      const path = await exportEncryptedBackup(snapshot, backupPassword);
      setModal(null);
      setBackupPassword('');
      setNotice('Encrypted backup exported and shared: ' + path.split('/').pop());
    } catch (caught: any) { setError(caught?.message || 'Backup export failed.'); }
    finally { setBusy(false); }
  };

  const restoreBackup = async () => {
    if (!backupPassword.trim()) { setError('Enter the password used to encrypt this backup.'); return; }
    setBusy(true); setError('');
    try {
      requireRoleFeature('canExportImportData', 'restore backups');
      const selectedFiles = await pick({
        type: [documentTypes.allFiles],
        mode: 'import',
        allowMultiSelection: false,
        presentationStyle: 'pageSheet'
      });
      const picked = selectedFiles[0];
      if (!picked?.uri) throw new Error('The selected backup file could not be opened.');
      const [copy] = await keepLocalCopy({
        files: [{
          uri: picked.uri,
          fileName: picked.name || 'beboss-backup.beboss'
        }],
        destination: 'cachesDirectory'
      });
      if (!copy || copy.status !== 'success' || !copy.localUri) {
        throw new Error('The selected backup could not be copied into the app cache.');
      }
      const fileUri = copy.localUri;
      const filePath = fileUri.startsWith('file://') ? decodeURIComponent(fileUri.slice(7)) : fileUri;
      const backup = await decryptBackupFile(filePath, backupPassword);
      const summary = await restoreEncryptedBackupData(backup, actor!);
      await reload(actor!.id);
      setModal(null);
      setBackupPassword('');
      setNotice('Backup merged successfully. Restored: ' +
        summary.products + ' products, ' + summary.customers + ' customers, ' +
        summary.sales + ' sales and ' + summary.payments + ' payments. Staff credentials, subscriptions and cloud device keys were preserved.');
    } catch (caught: any) {
      if (!(isErrorWithCode(caught) && caught.code === errorCodes.OPERATION_CANCELED)) {
        setError(caught?.message || 'Backup restore failed.');
      }
    } finally { setBusy(false); }
  };

  const requireRoleFeature = (permission: 'canExportImportData' | 'canExportReports' | 'canViewAnalytics', label: string) => {
    if (!actor || !actor[permission]) throw new Error('Your staff role does not have permission to ' + label + '.');
  };

  const printReceipt = async () => {
    if (!receiptNumber) return;
    const sale = snapshot?.sales.find(item => item.receiptNumber === receiptNumber);
    if (!sale) { setError('The saved receipt could not be found.'); return; }
    const text = [
      profile?.shopName || 'BeBoss',
      profile?.address || '',
      'Receipt: ' + sale.receiptNumber,
      new Date(sale.saleDate).toLocaleString(),
      'Customer: ' + sale.customerName,
      '--------------------------------',
      ...sale.items.map(item => item.productName + ' x' + item.quantitySold + '  ' + money(item.subtotal, currency)),
      '--------------------------------',
      'Total: ' + money(sale.totalAmount, currency),
      'Paid: ' + money(sale.amountPaid, currency),
      'Balance: ' + money(sale.totalAmount - sale.amountPaid, currency),
      'Payment: ' + sale.paymentMethod,
      profile?.receiptFooter || 'Thank you!'
    ].join('\n');
    try {
      await printer.printText(text);
      setNotice('Receipt sent to the connected BLE printer.');
    } catch (caught: any) { setError(caught?.message || 'Receipt printing failed.'); }
  };

  const logout = () => Alert.alert('Lock BeBoss', 'Sign out of this iPhone terminal?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Lock', style: 'destructive', onPress: () => {
      setActor(null); setSnapshot(previous => previous ? { ...previous, currentUser: null } : previous);
      setCart([]); setScreen('dashboard'); setNotice('This terminal is locked.');
    } }
  ]);

  if (loading) return <LoadingView />;
  if (error && !snapshot) return <ErrorStartupView message={error} onRetry={() => { setLoading(true); initializeStore().then(() => loadSnapshot(null)).then(setSnapshot).catch((e: any) => setError(e.message)).finally(() => setLoading(false)); }} />;
  if (!registered || !profile) {
    return (
      <AuthShell title="Set up your business" subtitle="Create the first owner account on this iPhone.">
        <Field label="Shop name" value={profileForm.shopName} onChangeText={value => setProfileForm({ ...profileForm, shopName: value })} />
        <Field label="Owner full name" value={profileForm.ownerName} onChangeText={value => setProfileForm({ ...profileForm, ownerName: value })} />
        <Field label="Owner username" value={profileForm.username} autoCapitalize="none" onChangeText={value => setProfileForm({ ...profileForm, username: value })} />
        <Field label="Rwanda phone number" value={profileForm.phone} keyboardType="phone-pad" onChangeText={value => setProfileForm({ ...profileForm, phone: value })} />
        <Field label="Shop address" value={profileForm.address} onChangeText={value => setProfileForm({ ...profileForm, address: value })} />
        <Field label="Owner PIN (4–6 digits)" value={profileForm.pin} secureTextEntry keyboardType="number-pad" onChangeText={value => setProfileForm({ ...profileForm, pin: value })} />
        <Field label="Password" value={profileForm.password} secureTextEntry onChangeText={value => setProfileForm({ ...profileForm, password: value })} />
        <ButtonPrimary title="Create encrypted shop workspace" onPress={doRegister} loading={busy} />
        <Text style={styles.muted}>The four-day trial is recorded locally. Paid access and remote entitlement changes must be verified by BeBoss Cloud.</Text>
        <Message error={error} notice={notice} />
      </AuthShell>
    );
  }

  if (!actor) {
    return (
      <AuthShell title="Welcome back" subtitle={profile.shopName + ' • Secure terminal sign-in'}>
        <Field label="Staff username" value={loginName} autoCapitalize="none" onChangeText={setLoginName} editable={!iosDeviceEnrolled} />
        <Field label="PIN or password" value={loginSecret} secureTextEntry onChangeText={setLoginSecret} />
        <ButtonPrimary title="Unlock BeBoss" onPress={doLogin} loading={busy} />
        <Text style={styles.muted}>{iosDeviceEnrolled
          ? 'This iPhone is assigned to one cloud-registered staff account. Only that username, role and branch can unlock this device.'
          : 'Staff credentials are verified locally using PBKDF2-HMAC-SHA256. Android legacy pepper hashes are not copied to iPhone.'}</Text>
        <Message error={error} notice={notice} />
      </AuthShell>
    );
  }

  const nav: Array<{ key: Screen; label: string; glyph: string }> = [
    { key: 'dashboard', label: 'Home', glyph: '⌂' },
    { key: 'pos', label: 'POS', glyph: '▣' },
    { key: 'inventory', label: 'Stock', glyph: '▤' },
    { key: 'customers', label: 'Clients', glyph: '♙' },
    { key: 'sales', label: 'Sales', glyph: '▧' }
  ];

  const renderDashboard = () => (
    <View>
      <View style={styles.greeting}>
        <View>
          <Text style={styles.eyebrow}>BUSINESS OVERVIEW</Text>
          <Text style={styles.pageTitle}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {actor.name.split(' ')[0]}</Text>
          <Text style={styles.subTitle}>{profile.shopName}</Text>
        </View>
        <View style={styles.statusPill}><View style={[styles.dot, { backgroundColor: online ? COLORS.green : COLORS.amber }]} /><Text style={styles.statusText}>{online ? 'ONLINE' : 'OFFLINE'}</Text></View>
      </View>
      <View style={styles.metricGrid}>
        <Metric label="Sales recorded" value={money(snapshot?.totalSales || 0, currency)} tone="orange" />
        <Metric label="Gross profit" value={money(snapshot?.totalProfit || 0, currency)} tone="green" />
        <Metric label="Customer debt" value={money(snapshot?.totalDebt || 0, currency)} tone="red" />
        <Metric label="Low stock" value={String(snapshot?.lowStockCount || 0)} tone="amber" />
      </View>
      <SectionHeader title="Quick actions" />
      <View style={styles.quickGrid}>
        <QuickAction title="New sale" glyph="＋" onPress={() => setScreen('pos')} />
        <QuickAction title="Add product" glyph="▤" onPress={() => openNewProduct()} />
        <QuickAction title="Add customer" glyph="♙" onPress={() => openCustomer()} />
        <QuickAction title="Receive stock" glyph="⇧" onPress={() => openPurchase()} />
      </View>
      <SectionHeader title="Stock requiring attention" action="View inventory" onAction={() => setScreen('inventory')} />
      {(snapshot?.products || []).filter(item => item.quantityInStock <= item.lowStockThreshold).slice(0, 5).map(product =>
        <ProductRow key={product.id} product={product} currency={currency} onPress={() => openStockAdjustment(product)} />
      )}
      {!snapshot?.lowStockCount ? <EmptyState title="Stock levels look good" subtitle="No products are currently below their reorder level." /> : null}
      <SectionHeader title="Recent transactions" action="Sales history" onAction={() => setScreen('sales')} />
      {(snapshot?.sales || []).slice(0, 5).map(sale =>
        <SaleRow key={sale.id} sale={sale} currency={currency} />
      )}
      {!snapshot?.sales.length ? <EmptyState title="No sales yet" subtitle="Your completed point-of-sale transactions will appear here." /> : null}
    </View>
  );

  const renderPos = () => (
    <View style={{ flex: 1 }}>
      <PageHeading title="Point of sale" subtitle="Select catalogue products and build a checkout basket." action="Quick custom sale" onAction={openQuickSale} />
      <View style={styles.searchRow}>
        <TextInput style={[styles.input, { flex: 1 }]} value={search} onChangeText={setSearch} placeholder="Search product, barcode or category" placeholderTextColor={COLORS.muted} />
        <Pressable style={styles.scanButton} onPress={() => setShowScanner(true)}><Text style={styles.scanGlyph}>⌗</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {['All', ...Array.from(new Set((snapshot?.products || []).map(item => item.category)))].map(item =>
          <Chip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
        )}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 18 }}>
        {visibleProducts.map(product => (
          <Pressable key={product.id} style={styles.posProduct} onPress={() => addToCart(product)}>
            <View style={styles.productIcon}><Text style={styles.productIconText}>{product.name.slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{product.name}</Text>
              <Text style={styles.rowSub}>{product.category} • Stock {product.quantityInStock} {product.unit}</Text>
              {product.isDeleted ? <Text style={styles.warningText}>Archived</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.price}>{money(product.sellingPrice, currency)}</Text>
              <Text style={product.quantityInStock <= product.lowStockThreshold ? styles.warningText : styles.rowSub}>Tap to add</Text>
            </View>
          </Pressable>
        ))}
        {!visibleProducts.length ? <EmptyState title="No products found" subtitle="Adjust your search or add a new product to the inventory." action="Add product" onAction={() => openNewProduct()} /> : null}
      </ScrollView>
      <View style={styles.cartDock}>
        <View style={styles.cartHeader}>
          <View><Text style={styles.cartTitle}>Current basket · {cart.length} lines</Text><Text style={styles.rowSub}>{cartProducts.reduce((sum, item) => sum + item.line.quantity, 0)} items</Text></View>
          <Text style={styles.cartTotal}>{money(cartSubtotal, currency)}</Text>
        </View>
        {cartProducts.slice(0, 3).map(({ product, line }) => (
          <View key={product.id} style={styles.cartLine}>
            <Text numberOfLines={1} style={{ flex: 1, color: COLORS.ink, fontWeight: '600' }}>{product.name} × {line.quantity}</Text>
            <Pressable onPress={() => changeCartQuantity(product, -1)} style={styles.qtyButton}><Text>−</Text></Pressable>
            <Pressable onPress={() => changeCartQuantity(product, 1)} style={styles.qtyButton}><Text>＋</Text></Pressable>
          </View>
        ))}
        <View style={styles.inlineActions}>
          <ButtonSecondary title="Clear" onPress={() => setCart([])} disabled={!cart.length} />
          <ButtonSecondary title="Hold" onPress={holdCurrentCart} disabled={!cart.length} />
          <ButtonPrimary title="Checkout" onPress={() => {
            if (!cart.length) return;
            setDiscount('0'); setPaid(String(cartSubtotal)); setCustomerChoice(''); setModal('checkout');
          }} disabled={!cart.length} />
        </View>
        {(snapshot?.heldCarts.length || 0) > 0 ? <>
          <Text style={styles.fieldLabel}>Held sales · {snapshot?.heldCarts.length}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {snapshot?.heldCarts.map(held => (
              <View key={held.id} style={styles.heldCartChip}>
                <Pressable onPress={() => resumeHeldCart(held)}>
                  <Text style={styles.chipTextSelected}>{held.label}</Text>
                  <Text style={styles.heldCartMeta}>{held.items.length} lines · {money(held.items.reduce((sum, line) => {
                    const product = snapshot.products.find(item => item.id === line.productId);
                    return sum + (product?.sellingPrice || line.customPrice || 0) * line.quantity;
                  }, 0), currency)}</Text>
                  <Text style={styles.heldCartAction}>Resume sale</Text>
                </Pressable>
                <Pressable onPress={() => Alert.alert('Delete held sale?', held.label, [
                  { text: 'Keep', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => run(async () => { await deleteHeldCart(held.id, actor!); }, 'Held sale deleted.') }
                ])}><Text style={styles.heldCartDelete}>Remove</Text></Pressable>
              </View>
            ))}
          </ScrollView>
        </> : null}
      </View>
    </View>
  );

  const renderInventory = () => (
    <View>
      <PageHeading title="Inventory" subtitle="Products, selling prices, cost, stock and reorder thresholds." action="Add product" onAction={() => openNewProduct()} />
      <ButtonSecondary title={showArchivedProducts ? 'Hide archived products' : 'View archived products'} onPress={async () => {
        if (!showArchivedProducts) {
          try { setArchivedProducts(await listArchivedProducts()); }
          catch (caught: any) { setError(caught?.message || 'Could not load archived products.'); return; }
        }
        setShowArchivedProducts(value => !value);
      }} />
      <Field label="Search inventory" value={search} onChangeText={setSearch} />
      {(snapshot?.products || []).filter(product => !search.trim() || [product.name, product.barcode, product.category].some(value => value.toLowerCase().includes(search.toLowerCase()))).map(product => (
        <View key={product.id} style={styles.inventoryCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{product.name}</Text>
            <Text style={styles.rowSub}>{product.category} • {product.barcode || 'No barcode'}</Text>
            <Text style={styles.rowSub}>Qty {product.quantityInStock} • Reorder at {product.lowStockThreshold}</Text>
            {actor.canViewCostAndProfit ? <Text style={styles.rowSub}>Cost {money(product.costPrice, currency)} • Margin {money(product.sellingPrice - product.costPrice, currency)}</Text> : null}
            <Text style={product.quantityInStock <= product.lowStockThreshold ? styles.warningText : styles.rowSub}>{product.quantityInStock <= product.lowStockThreshold ? 'LOW STOCK' : 'IN STOCK'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.price}>{money(product.sellingPrice, currency)}</Text>
            <ActionLink label="Edit" onPress={() => openNewProduct(product)} />
            <ActionLink label="Adjust" onPress={() => openStockAdjustment(product)} />
            {actor.canDeleteRecords ? <ActionLink label="Archive" danger onPress={() => Alert.alert('Archive product?', product.name + ' will no longer appear at checkout. Sales history is preserved.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Archive', style: 'destructive', onPress: () => run(async () => deleteProduct(product.id, actor), 'Product archived.') }
            ])} /> : null}
          </View>
        </View>
      ))}
      {showArchivedProducts ? <>
        <SectionHeader title="Archived products" />
        {archivedProducts.map(product => (
          <View key={product.id} style={styles.compactRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{product.name}</Text>
              <Text style={styles.rowSub}>{product.category} · archived {new Date(product.updatedAt).toLocaleDateString()}</Text>
            </View>
            <ActionLink label="Restore product" onPress={() => run(async () => {
              await restoreProduct(product.id, actor!);
              setArchivedProducts(await listArchivedProducts());
            }, 'Product restored to active inventory.')} />
          </View>
        ))}
        {!archivedProducts.length ? <EmptyState title="No archived products" subtitle="Archived products appear here and can be restored without losing sales history." /> : null}
      </> : null}
    </View>
  );

  const renderCustomers = () => (
    <View>
      <PageHeading title="Customers & credit" subtitle="Customer profiles, account balances and payment ledger." action="Add customer" onAction={() => openCustomer()} />
      <ButtonSecondary title={showArchivedCustomers ? 'Hide archived customers' : 'View archived customers'} onPress={async () => {
        if (!showArchivedCustomers) {
          try { setArchivedCustomers(await listArchivedCustomers()); }
          catch (caught: any) { setError(caught?.message || 'Could not load archived customers.'); return; }
        }
        setShowArchivedCustomers(value => !value);
      }} />
      <Metric label="Total outstanding debt" value={money(snapshot?.totalDebt || 0, currency)} tone="red" />
      {(snapshot?.customers || []).map(customer => (
        <View key={customer.id} style={styles.customerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{customer.name}</Text>
            <Text style={styles.rowSub}>{customer.phone || 'No phone'} • {customer.category}</Text>
            <Text style={[styles.price, { color: customer.debtBalance > 0 ? COLORS.red : COLORS.green }]}>{money(customer.debtBalance, currency)} due</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <ActionLink label="Edit" onPress={() => openCustomer(customer)} />
            <ActionLink label="Receive payment" onPress={() => openPayment(customer)} disabled={customer.debtBalance <= 0 || !actor.canCollectDebt} />
            {actor.canDeleteRecords ? <ActionLink label="Archive customer" danger onPress={() => Alert.alert(
              'Archive customer?',
              'The customer and payment history will be retained. The record can be restored later.',
              [
                { text: 'Keep customer', style: 'cancel' },
                { text: 'Archive', style: 'destructive', onPress: () => run(async () => {
                  await deleteCustomer(customer.id, actor!);
                  setArchivedCustomers(await listArchivedCustomers());
                }, 'Customer archived.') }
              ]
            )} /> : null}
          </View>
        </View>
      ))}
      {!snapshot?.customers.length ? <EmptyState title="No customer accounts" subtitle="Create customer records to keep contacts and credit balances in one place." /> : null}
      {showArchivedCustomers ? <>
        <SectionHeader title="Archived customers" />
        {archivedCustomers.map(customer => (
          <View key={customer.id} style={styles.compactRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{customer.name}</Text>
              <Text style={styles.rowSub}>{customer.phone || 'No phone'} · debt {money(customer.debtBalance, currency)}</Text>
            </View>
            <ActionLink label="Restore customer" onPress={() => run(async () => {
              await restoreCustomer(customer.id, actor!);
              setArchivedCustomers(await listArchivedCustomers());
            }, 'Customer restored.')} />
          </View>
        ))}
        {!archivedCustomers.length ? <EmptyState title="No archived customers" subtitle="Archived customer records can be restored while preserving account history." /> : null}
      </> : null}
    </View>
  );

  const renderSales = () => (
    <View>
      <PageHeading title="Sales history" subtitle="Saved receipts, payment status and sales reversals." />
      {(snapshot?.sales || []).map(sale => (
        <View key={sale.id} style={styles.card}>
          <SaleRow sale={sale} currency={currency} />
          <Text style={styles.rowSub}>{sale.items.length} lines • {sale.paymentStatus} • {new Date(sale.saleDate).toLocaleString()}</Text>
          {actor.canDeleteRecords ? <ActionLink label="Reverse sale" danger onPress={() => Alert.alert('Reverse this sale?', 'Stock will be restored and the unpaid customer debt will be reduced. This action is recorded in the audit log.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reverse sale', style: 'destructive', onPress: () => run(async () => reverseSale(sale.id, actor), 'Sale reversed and inventory restored.') }
          ])} /> : null}
          <ActionLink label="Print receipt" onPress={() => {
            setReceiptNumber(sale.receiptNumber);
            Alert.alert('Receipt selected', sale.receiptNumber + '. Connect a compatible BLE printer in Settings to print.');
          }} />
        </View>
      ))}
      {!snapshot?.sales.length ? <EmptyState title="Sales history is empty" subtitle="New receipts are stored locally and queued for secure cloud sync." action="Open POS" onAction={() => setScreen('pos')} /> : null}
    </View>
  );

  const renderReports = () => {
    if (!actor.canViewAnalytics) return <EmptyState title="Reports restricted" subtitle="Your staff role does not have permission to view business analytics." />;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysSinceMonday = (weekStartDate.getDay() + 6) % 7;
    weekStartDate.setDate(weekStartDate.getDate() - daysSinceMonday);
    const startTime = analyticsPeriod === 'TODAY' ? startOfToday
      : analyticsPeriod === 'THIS_WEEK' ? weekStartDate.getTime()
      : analyticsPeriod === 'THIS_MONTH' ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      : 0;
    const effectiveBranch = actor.branchId || reportBranch;
    const filteredSales = (snapshot?.sales || []).filter(sale =>
      sale.saleDate >= startTime &&
      sale.saleDate <= now.getTime() &&
      (effectiveBranch === 'ALL' || sale.branchId === effectiveBranch)
    );
    const filteredProducts = (snapshot?.products || []).filter(product =>
      effectiveBranch === 'ALL' || product.branchId === effectiveBranch
    );
    const totalSales = filteredSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.totalProfit, 0);
    const totalCost = filteredSales.reduce((sum, sale) => sum + sale.totalCost, 0);
    const averageSale = filteredSales.length ? totalSales / filteredSales.length : 0;
    const margin = totalSales > 0 ? totalProfit / totalSales * 100 : 0;

    const productTotals = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();
    for (const sale of filteredSales) {
      for (const line of sale.items || []) {
        const current = productTotals.get(line.productId) || { name: line.productName, quantity: 0, revenue: 0, profit: 0 };
        current.quantity += line.quantitySold;
        current.revenue += line.subtotal;
        current.profit += line.profit;
        productTotals.set(line.productId, current);
      }
    }
    const topProducts = Array.from(productTotals.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6);
    const branchTotals = new Map<string, { name: string; revenue: number; profit: number; sales: number }>();
    for (const sale of filteredSales) {
      const current = branchTotals.get(sale.branchId) || {
        name: sale.branchName || sale.branchId, revenue: 0, profit: 0, sales: 0
      };
      current.revenue += sale.totalAmount;
      current.profit += sale.totalProfit;
      current.sales += 1;
      branchTotals.set(sale.branchId, current);
    }
    const reorderSuggestions = buildReorderSuggestions(filteredProducts, snapshot?.sales || [], {
      branchId: effectiveBranch,
      leadTimeDays: 7,
      reviewPeriodDays: 7,
      nowMs: now.getTime()
    }).slice(0, 12);
    const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index));
      const dayStart = day.getTime();
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
      const daySales = filteredSales.filter(sale => sale.saleDate >= dayStart && sale.saleDate < dayEnd);
      return {
        label: day.toLocaleDateString(undefined, { weekday: 'short' }),
        revenue: daySales.reduce((sum, sale) => sum + sale.totalAmount, 0),
        count: daySales.length
      };
    });
    const maxDayRevenue = Math.max(1, ...lastSevenDays.map(day => day.revenue));
    const paymentTotals = new Map<string, number>();
    filteredSales.forEach(sale => {
      if (sale.paymentBreakdown?.length) {
        sale.paymentBreakdown.forEach(part => paymentTotals.set(part.method, (paymentTotals.get(part.method) || 0) + part.amount));
      } else {
        paymentTotals.set(sale.paymentMethod, (paymentTotals.get(sale.paymentMethod) || 0) + sale.amountPaid);
      }
    });
    const exportCurrentSales = async () => {
      try {
        requireRoleFeature('canExportReports', 'export sales reports');
        const path = await exportSalesCsv(filteredSales, profile!);
        setNotice('Sales report exported: ' + path.split('/').pop());
      } catch (caught: any) { setError(caught?.message || 'Sales report export failed.'); }
    };
    const exportCurrentInventory = async () => {
      try {
        requireRoleFeature('canExportReports', 'export inventory reports');
        const path = await exportInventoryCsv(filteredProducts, snapshot?.branches || [], profile!);
        setNotice('Inventory report exported: ' + path.split('/').pop());
      } catch (caught: any) { setError(caught?.message || 'Inventory report export failed.'); }
    };

    return (
      <View>
        <PageHeading title="Business intelligence" subtitle="Sales, gross profit, payment mix, branch performance and inventory demand." />
        <SelectChips label="Reporting period" values={[
          { label: 'Today', value: 'TODAY' },
          { label: 'This week', value: 'THIS_WEEK' },
          { label: 'This month', value: 'THIS_MONTH' },
          { label: 'All time', value: 'ALL_TIME' }
        ]} value={analyticsPeriod} onChange={setAnalyticsPeriod} />
        {!actor.branchId ? <SelectChips label="Branch scope" values={[
          { label: 'All branches', value: 'ALL' },
          ...(snapshot?.branches.filter(branch => branch.isActive).map(branch => ({ label: branch.name, value: branch.id })) || [])
        ]} value={reportBranch} onChange={setReportBranch} /> : null}
        <View style={styles.metricGrid}>
          <Metric label="Recorded revenue" value={money(totalSales, currency)} tone="orange" />
          <Metric label="Gross profit" value={money(totalProfit, currency)} tone="green" />
          <Metric label="Gross margin" value={margin.toFixed(1) + '%'} tone="green" />
          <Metric label="Average sale" value={money(averageSale, currency)} />
        </View>
        <Text style={styles.muted}>{filteredSales.length} sales · Revenue net of discounts · Cost of goods {money(totalCost, currency)}</Text>
        <SectionHeader title="Sales trend · last seven days" />
        <View style={styles.card}>
          {lastSevenDays.map(day => (
            <View key={day.label} style={styles.trendRow}>
              <Text style={styles.trendLabel}>{day.label}</Text>
              <View style={styles.trendTrack}>
                <View style={[styles.trendBar, { width: Math.max(day.revenue > 0 ? 2 : 0, (day.revenue / maxDayRevenue) * 100) + '%' }]} />
              </View>
              <Text style={styles.trendValue}>{money(day.revenue, currency)}</Text>
            </View>
          ))}
        </View>
        <SectionHeader title="Top performing products" action="Export inventory" onAction={exportCurrentInventory} />
        {topProducts.map(([id, item]) => (
          <View key={id} style={styles.compactRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>{item.quantity} units sold · Gross profit {money(item.profit, currency)}</Text>
            </View>
            <Text style={styles.price}>{money(item.revenue, currency)}</Text>
          </View>
        ))}
        {!topProducts.length ? <EmptyState title="No sales in this period" subtitle="Sales must be recorded before product performance can be calculated." /> : null}
        {branchTotals.size > 1 ? <>
          <SectionHeader title="Branch performance" />
          {Array.from(branchTotals.entries()).sort((a, b) => b[1].revenue - a[1].revenue).map(([id, item]) => (
            <View key={id} style={styles.compactRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>{item.sales} transactions · Profit {money(item.profit, currency)}</Text>
              </View>
              <Text style={styles.price}>{money(item.revenue, currency)}</Text>
            </View>
          ))}
        </> : null}
        <SectionHeader title="Payment method mix" />
        {Array.from(paymentTotals.entries()).map(([method, amount]) => (
          <View key={method} style={styles.compactRow}>
            <Text style={[styles.rowTitle, { flex: 1 }]}>{method.replace('_', ' ')}</Text>
            <Text style={styles.price}>{money(amount, currency)}</Text>
          </View>
        ))}
        <SectionHeader title="Demand-based reorder suggestions" />
        <Text style={styles.muted}>Forecast from 56 local sales days, recent trend, weekday seasonality and a 7-day replenishment lead time. Suggestions are limited to the selected branch scope.</Text>
        {reorderSuggestions.map(({ product, forecast }) => (
          <View key={product.id} style={styles.inventoryCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{product.name}</Text>
              <Text style={styles.rowSub}>Stock {product.quantityInStock} · Reorder point {Math.ceil(forecast.reorderPoint)} · {forecast.confidence} confidence</Text>
              <Text style={styles.rowSub}>Daily demand {forecast.forecastDailyDemand.toFixed(2)} · Safety stock {forecast.safetyStock.toFixed(1)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.warningText}>Order {forecast.suggestedOrderQuantity}</Text>
              <ActionLink label="Receive stock" onPress={() => openPurchase(product)} />
            </View>
          </View>
        ))}
        {!reorderSuggestions.length ? <EmptyState title="No current reorder alerts" subtitle="No products are below their calculated demand-based replenishment point." /> : null}
        <View style={styles.inlineActions}>
          <ButtonSecondary title="Export sales CSV" onPress={exportCurrentSales} disabled={!actor.canExportReports} />
          <ButtonSecondary title="Export inventory CSV" onPress={exportCurrentInventory} disabled={!actor.canExportReports} />
        </View>
      </View>
    );
  };

  const renderPurchases = () => (
    <View>
      <PageHeading title="Purchasing" subtitle="Record supplier invoices and stock inflows." action="New purchase" onAction={() => openPurchase()} />
      <Metric label="Purchase records" value={String(snapshot?.purchases.length || 0)} />
      <Metric label="Total recorded purchase spend" value={money((snapshot?.purchases || []).reduce((sum, purchase) => sum + purchase.totalPurchaseCost, 0), currency)} />
      {(snapshot?.purchases || []).map(purchase => (
        <View key={purchase.id} style={styles.card}>
          <Text style={styles.rowTitle}>{purchase.invoiceNumber}</Text>
          <Text style={styles.rowSub}>{purchase.productName} × {purchase.quantityPurchased}</Text>
          <Text style={styles.rowSub}>{purchase.supplierName} • {purchase.paymentStatus}</Text>
          <Text style={styles.price}>{money(purchase.totalPurchaseCost, currency)}</Text>
          {actor.canDeleteRecords ? <ActionLink label="Delete purchase record" danger onPress={() => Alert.alert(
            'Delete purchase record?',
            'This removes the purchase ledger row but does not automatically change current stock. Use a stock adjustment if a physical stock correction is required.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete record', style: 'destructive', onPress: () => run(async () => {
                await deletePurchaseRecord(purchase.id, actor!);
              }, 'Purchase record deleted.') }
            ]
          )} /> : null}
        </View>
      ))}
    </View>
  );

  const renderBranches = () => (
    <View>
      <PageHeading title="Branches & transfers" subtitle="Manage store locations and controlled stock transfers." action="Add branch" onAction={() => openBranch()} />
      {(snapshot?.branches || []).map(branch => (
        <View key={branch.id} style={styles.card}>
          <Text style={styles.rowTitle}>{branch.name} {branch.isMainBranch ? '• MAIN RETAIL' : ''}</Text>
          <Text style={styles.rowSub}>{branch.locationType} • {branch.operationalStatus} • {branch.isActive ? 'Active' : 'Archived'}</Text>
          <Text style={styles.rowSub}>{branch.address}</Text>
          <View style={styles.inlineActions}>
            <ActionLink label="Edit branch" onPress={() => openBranch(branch)} />
            {branch.isActive ? <ActionLink label="Pause branch" onPress={() => run(async () => { await setBranchOperationalStatus(branch.id, 'PAUSED', actor!); }, 'Branch paused.')} /> : null}
            {!branch.isActive && actor.role === 'OWNER' ? <ActionLink label="Reopen branch" onPress={() => run(async () => { await saveBranch({ id: branch.id, name: branch.name, isActive: true }, actor!); }, 'Branch reactivated.')} /> : null}
            {!branch.isMainBranch && branch.isActive && actor.role === 'OWNER' ? <ActionLink label="Archive" danger onPress={() => Alert.alert('Archive branch?', 'A branch can only be archived after all assigned staff, active products and in-transit transfers have been cleared.', [
              { text: 'Keep branch', style: 'cancel' },
              { text: 'Archive branch', style: 'destructive', onPress: () => run(async () => archiveBranch(branch.id, actor!), 'Branch archived.') }
            ])} /> : null}
          </View>
        </View>
      ))}
      <SectionHeader title="Stock transfers" action="New transfer" onAction={openTransfer} />
      {(snapshot?.transfers || []).map(transfer => (
        <View key={transfer.id} style={styles.card}>
          <Text style={styles.rowTitle}>{transfer.transferNumber} · {transfer.productName}</Text>
          <Text style={styles.rowSub}>{transfer.quantity} units • {transfer.status}</Text>
          <Text style={styles.rowSub}>{transfer.fromBranchId} → {transfer.toBranchId}</Text>
          {transfer.status === 'IN_TRANSIT' ? <ActionLink label="Receive or cancel transfer" onPress={() => receiveTransfer(transfer.id)} /> : null}
        </View>
      ))}
      {!snapshot?.transfers.length ? <EmptyState title="No stock transfers" subtitle="Transfers remain in transit until the receiving branch confirms receipt." /> : null}
    </View>
  );

  const renderStaff = () => (
    <View>
      <PageHeading title="Staff & permissions" subtitle="Role-based local access to POS and shop operations." action="Add staff" onAction={() => openStaff()} />
      {(snapshot?.staff || []).map(staff => (
        <View key={staff.id} style={styles.card}>
          <Text style={styles.rowTitle}>{staff.name}</Text>
          <Text style={styles.rowSub}>@{staff.username} • {staff.role} • {staff.isActive ? 'Active' : 'Suspended'}</Text>
          <Text style={styles.rowSub}>{staff.branchName || staff.branchId || 'All branches'}</Text>
          <Text style={styles.rowSub}>POS {staff.canSellPOS ? '✓' : '—'} · Stock {staff.canManageInventory ? '✓' : '—'} · Reports {staff.canViewAnalytics ? '✓' : '—'} · Discounts {staff.canApplyDiscounts ? '✓' : '—'}</Text>
          <ActionLink label="Edit staff access" onPress={() => openStaff(staff)} />
        </View>
      ))}
    </View>
  );

  const renderSync = () => (
    <View>
      <PageHeading title="Synchronization & device health" subtitle="Offline-first business records with verified, multi-device cloud exchange." />
      <Metric label="Pending changes" value={String(diagnostics.pending)} tone="amber" />
      <Metric label="Failed / retryable changes" value={String(diagnostics.failed)} tone={diagnostics.failed ? 'red' : 'green'} />
      <Metric label="Local business records" value={String(diagnostics.localRows)} />
      <Metric label="Internet connection" value={online ? 'Connected' : 'Offline'} tone={online ? 'green' : 'amber'} />
      <Metric label="Owner phone session" value={cloudAuthenticated ? 'Verified' : 'Not signed in'} tone={cloudAuthenticated ? 'green' : 'amber'} />
      <Metric label="iPhone device credential" value={iosDeviceEnrolled ? 'Enrolled' : 'Not enrolled'} tone={iosDeviceEnrolled ? 'green' : 'amber'} />
      <Metric label="Cloud device role" value={iosSyncRole || 'Not available'} />
      <Metric label="Latest verified cloud generation" value={latestCloudUpdatedAt ? new Date(latestCloudUpdatedAt).toLocaleString() : 'No cloud snapshot yet'} />
      {iosDeviceEnrolled ? <View style={styles.noticeCard}>
        <Text style={styles.noticeHeading}>Enrolled iPhone</Text>
        <Text style={styles.rowSub}>{enrolledDeviceSummary}</Text>
        <Text style={styles.rowSub}>The server revalidates the iPhone ID, revocable device token, active staff assignment and role before each synchronization.</Text>
        <ButtonPrimary title="Synchronize this iPhone now" onPress={synchronizeIosNow} loading={busy} disabled={!online || !iosSyncReady} />
      </View> : null}
      <SectionHeader title="Owner-verified iPhone enrollment" />
      <Field label="Registered shop-owner username" value={ownerOtpUsername} autoCapitalize="none" onChangeText={setOwnerOtpUsername} />
      <Field label="Registered owner phone" value={ownerOtpPhone} onChangeText={setOwnerOtpPhone} keyboardType="phone-pad" />
      {!otpRequested ? <ButtonPrimary title="Request owner SMS code" onPress={requestOtp} loading={busy} disabled={!cloudConfigured} /> : (
        <>
          <Field label="SMS verification code" value={ownerOtp} onChangeText={setOwnerOtp} keyboardType="number-pad" />
          <ButtonPrimary title="Verify owner phone" onPress={confirmOtp} loading={busy} />
        </>
      )}
      <Field label="Owner-issued device invitation code" value={ownerJoinCode} onChangeText={setOwnerJoinCode} autoCapitalize="characters" />
      <Field label="Local PIN for this iPhone (4–6 digits)" value={deviceLocalPin} onChangeText={setDeviceLocalPin} secureTextEntry keyboardType="number-pad" />
      <Field label="Local password for this iPhone (8+ characters)" value={deviceLocalPassword} onChangeText={setDeviceLocalPassword} secureTextEntry />
      <Text style={styles.muted}>These credentials unlock this iPhone only. They do not replace, reveal or overwrite the Android staff credential stored on the shop's existing terminals.</Text>
      <ButtonPrimary title="Enroll and provision this iPhone" onPress={enrollThisIphone} loading={busy} disabled={!cloudConfigured || !cloudAuthenticated} />
      <ButtonSecondary title="Refresh device and cloud status" onPress={async () => {
        try {
          await refreshIosSyncStatus();
          setNotice('Latest iPhone device authorization and cloud snapshot status loaded.');
        } catch (caught: any) { setError(caught?.message || 'Could not refresh iPhone sync status.'); }
      }} disabled={busy} />
      <Text style={styles.muted}>Cloud uploads are signed with the shop-scoped DataShare key on the server. The key and plaintext device tokens are never included in exported shop records.</Text>
      <Text style={styles.muted}>Last successful cloud sync: {diagnostics.lastSyncAt ? new Date(diagnostics.lastSyncAt).toLocaleString() : 'Never'}</Text>
    </View>
  );

  const redeemLocalBB3Voucher = async () => {
    if (!voucherCode.trim()) { setError('Enter the signed BB3 voucher supplied by BeBoss.'); return; }
    setBusy(true); setError('');
    try {
      const result = await redeemBB3Voucher(voucherCode, actor!);
      setVoucherCode('');
      await reload(actor!.id);
      setRedeemedVouchers(await listRedeemedVouchers());
      setNotice('BB3 signature verified. ' + result.planName + ' extended by ' + result.daysAdded + ' days, until ' + new Date(result.newExpiry).toLocaleDateString() + '.');
    } catch (caught: any) {
      setError(caught?.message || 'BB3 voucher redemption failed.');
    } finally { setBusy(false); }
  };

  const renderSubscription = () => {
    const active = profile ? isSubscriptionActive(profile) : false;
    const remaining = Math.max(0, (profile?.subscriptionExpiresAt || 0) - Date.now());
    const days = Math.ceil(remaining / 86400000);
    const activeBranches = Math.max(1, (snapshot?.branches || []).filter(branch => branch.isActive && branch.operationalStatus === 'OPEN').length);
    const activeStaff = Math.max(1, (snapshot?.staff || []).filter(user => user.isActive).length);
    const devices = Math.max(1, profile?.deviceCountLimit || 1);
    const quote = calculateSubscriptionQuote(activeBranches, activeStaff, Number(subscriptionMonths), devices);
    const startCheckout = async () => {
      if (!profile) return;
      if (actor.role !== 'OWNER') { setError('Only the registered shop owner can create subscription payments.'); return; }
      if (!cloudAuthenticated) { setError('Verify the registered owner phone in Sync settings before starting payment.'); return; }
      if (!payerName.trim() || !payerEmail.trim() || !payerPhone.trim()) {
        setError('Enter the payer name, email and Rwanda mobile number.');
        return;
      }
      setBusy(true); setError(''); setPaymentRequestMessage('');
      try {
        const result = await createSubscriptionCheckout({
          username: profile.username,
          ownerPhone: profile.phone,
          payerPhone,
          payerName,
          payerEmail,
          shopName: profile.shopName,
          months: Number(subscriptionMonths) as 1 | 3 | 6 | 12,
          branches: activeBranches,
          workers: activeStaff,
          devices,
          gateway: subscriptionGateway
        });
        setPaymentRequestId(result.paymentRequestId);
        setPaymentRequestStatus(result.status || (result.pending ? 'PENDING' : 'CHECKOUT_CREATED'));
        setPaymentRequestMessage(result.message || 'Payment request created. Payment is not yet verified.');
        if (result.checkoutUrl) {
          await Linking.openURL(result.checkoutUrl);
        }
      } catch (caught: any) {
        setError(caught?.message || 'Subscription payment could not be started.');
      } finally { setBusy(false); }
    };
    const refreshPaymentStatus = async () => {
      if (!paymentRequestId || !profile) return;
      setBusy(true); setError('');
      try {
        const status = await checkSubscriptionPaymentStatus(paymentRequestId, profile.username, profile.phone);
        setPaymentRequestStatus(status.status);
        setPaymentRequestMessage(status.message);
        if (status.verified) {
          setNotice('Provider reports successful payment. It remains pending BeBoss administrator review and BB3 authorization; this iPhone has not self-activated the subscription.');
        }
      } catch (caught: any) { setError(caught?.message || 'Payment status could not be checked.'); }
      finally { setBusy(false); }
    };

    return (
      <View>
        <PageHeading title="Subscription & billing" subtitle="Server-priced plans and provider-verified payments. This iPhone cannot self-activate an entitlement." />
        <View style={styles.noticeCard}>
          <Text style={styles.noticeHeading}>{profile?.subscriptionStatus || 'UNKNOWN'} {active ? '· Active on local profile' : '· Expired or locked'}</Text>
          <Text style={styles.rowSub}>{profile?.subscriptionStatus === 'TRIAL' ? 'Local trial estimate: ' + days + ' day(s) remaining. Final entitlement is server-controlled.' : 'Local expiry estimate: ' + new Date(profile!.subscriptionExpiresAt).toLocaleString()}</Text>
          <Text style={styles.rowSub}>Registered device allowance: {profile?.deviceCountLimit || 1}</Text>
        </View>
        <Text style={styles.muted}>Plan pricing follows the Android price rules. The checkout service recalculates the final amount from the registered shop's server-side branch, staff and device usage before it accepts the payment.</Text>
        <SectionHeader title="Registered shop plan" />
        <Metric label="Active retail branches" value={String(activeBranches)} />
        <Metric label="Active staff accounts" value={String(activeStaff)} />
        <Metric label="Billable devices requested" value={String(devices)} />
        <SelectChips label="Subscription duration" values={[
          { label: '1 month', value: '1' },
          { label: '3 months · 10% off', value: '3' },
          { label: '6 months', value: '6' },
          { label: '12 months · 20% off', value: '12' }
        ]} value={subscriptionMonths} onChange={value => setSubscriptionMonths(value as typeof subscriptionMonths)} />
        <View style={styles.card}>
          <Text style={styles.rowTitle}>Server pricing estimate</Text>
          <Text style={styles.rowSub}>Branch base {money(quote.branchBasePrice, currency)} · Staff add-on {money(quote.workerFee, currency)} · Extra devices {money(quote.deviceFee, currency)}</Text>
          <Text style={styles.rowSub}>{quote.discountPercent}% duration discount · {money(quote.discountAmount, currency)} saved</Text>
          <Text style={[styles.price, { fontSize: 20, marginTop: 6 }]}>{money(quote.totalPayable, currency)}</Text>
          <Text style={styles.muted}>The server is authoritative. If the plan is below the live shop usage or the server price differs, the checkout will be rejected safely.</Text>
        </View>
        <SectionHeader title="Redeem administrator-issued BB3 voucher" />
        <Text style={styles.muted}>iPhone verifies the same pinned ECDSA-P256 public key as Android. The private signing key never enters the app. This iPhone rejects legacy BB and BB2 codes; they require their legacy migration or server verification path.</Text>
        <Field label="Signed BB3 unlock code" value={voucherCode} onChangeText={setVoucherCode} autoCapitalize="none" />
        <ButtonPrimary title="Verify and redeem BB3 voucher" onPress={redeemLocalBB3Voucher} loading={busy} disabled={actor.role !== 'OWNER'} />
        <ButtonSecondary title="View redeemed voucher history" onPress={async () => {
          try { setRedeemedVouchers(await listRedeemedVouchers()); }
          catch (caught: any) { setError(caught?.message || 'Could not load voucher history.'); }
        }} />
        {redeemedVouchers.length ? <View style={styles.card}>
          <Text style={styles.rowTitle}>Redeemed on this iPhone</Text>
          {redeemedVouchers.map(item => <Text key={item.fingerprint} style={styles.rowSub}>{item.planName} · +{item.daysAdded} days · {new Date(item.redeemedAt).toLocaleDateString()}</Text>)}
        </View> : null}
        <SectionHeader title="Provider-verified payment" />
        <Field label="Payer full name" value={payerName || profile?.ownerName || ''} onChangeText={setPayerName} />
        <Field label="Payer email" value={payerEmail || profile?.email || ''} onChangeText={setPayerEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Payer Rwanda mobile number" value={payerPhone || profile?.phone || ''} onChangeText={setPayerPhone} keyboardType="phone-pad" />
        <SelectChips label="Payment gateway" values={[
          { label: 'MTN MoMo', value: 'mtn_momo' },
          { label: 'Flutterwave', value: 'flutterwave' },
          { label: 'Stripe', value: 'stripe' }
        ]} value={subscriptionGateway} onChange={value => setSubscriptionGateway(value as typeof subscriptionGateway)} />
        <ButtonPrimary title="Create secure subscription payment" onPress={startCheckout} loading={busy} disabled={actor.role !== 'OWNER' || !cloudAuthenticated || !cloudConfigured} />
        {paymentRequestId ? <View style={styles.card}>
          <Text style={styles.rowTitle}>Payment request · {paymentRequestStatus}</Text>
          <Text style={styles.rowSub}>Reference: {paymentRequestId}</Text>
          <Text style={styles.rowSub}>{paymentRequestMessage}</Text>
          {subscriptionGateway === 'mtn_momo' ? <ButtonSecondary title="Check MTN MoMo status" onPress={refreshPaymentStatus} disabled={busy} /> : null}
          <Text style={styles.muted}>A provider success response is only payment verification. The request remains in the BeBoss admin review queue until an authorized administrator issues a matching BB3 unlock. This app will not unlock itself using an SMS or payer-entered reference.</Text>
        </View> : null}
        <Text style={styles.muted}>Owner phone verification is required. Card checkout opens the provider-hosted payment page; MTN prompts the payer's wallet and must be checked again for final settlement. If the provider reports a pending or uncertain result, keep the same request and do not pay twice.</Text>
        <ButtonSecondary title="Open owner verification and sync" onPress={() => setScreen('sync')} />
      </View>
    );
  };

  const renderSettings = () => (
    <View>
      <PageHeading title="Settings" subtitle="Business settings, security, receipt output and backups." action="Edit shop" onAction={openSettings} />
      <View style={styles.card}>
        <Text style={styles.rowTitle}>{profile?.shopName}</Text>
        <Text style={styles.rowSub}>{profile?.ownerName} • {profile?.phone}</Text>
        <Text style={styles.rowSub}>{profile?.address}</Text>
        <Text style={styles.rowSub}>Currency: {profile?.currencyCode} ({profile?.currencySymbol})</Text>
      </View>
      <SectionHeader title="Security" />
      <ButtonSecondary title="Enable Face ID / Touch ID" onPress={async () => {
        try { await enableBiometricUnlock(); setNotice('Biometric key installed in the iPhone Keychain.'); }
        catch (caught: any) { setError(caught.message || 'Biometric setup failed.'); }
      }} />
      <ButtonSecondary title="Test biometric unlock" onPress={async () => {
        const ok = await requireBiometricUnlock();
        setNotice(ok ? 'Biometric verification succeeded.' : 'Biometric verification was not completed or no biometric key is configured.');
      }} />
      <ButtonSecondary title="Export encrypted backup" onPress={() => { setBackupMode('EXPORT'); setBackupPassword(''); setModal('backup'); }} disabled={!actor.canExportImportData} />
      <ButtonSecondary title="Import encrypted backup" onPress={() => { setBackupMode('RESTORE'); setBackupPassword(''); setModal('backup'); }} disabled={!actor.canExportImportData} />
      <SectionHeader title="Receipt printer (Bluetooth LE)" />
      <PrinterControls printer={printer} />
      <SectionHeader title="Terminal" />
      <Text style={styles.muted}>iPhone app version 1.0.0 · Device-local encrypted SQLCipher store · iOS {Platform.Version}</Text>
      <ButtonSecondary title="Lock terminal" onPress={logout} />
      <ButtonSecondary title="Sign out of cloud session" onPress={() => signOutCloud().then(() => { setCloudAuthenticated(false); setNotice('Cloud session signed out.'); }).catch((e: any) => setError(e.message))} />
    </View>
  );

  let content: React.ReactNode;
  switch (screen) {
    case 'dashboard': content = renderDashboard(); break;
    case 'pos': content = renderPos(); break;
    case 'inventory': content = renderInventory(); break;
    case 'customers': content = renderCustomers(); break;
    case 'sales': content = renderSales(); break;
    case 'reports': content = renderReports(); break;
    case 'purchases': content = renderPurchases(); break;
    case 'branches': content = renderBranches(); break;
    case 'staff': content = renderStaff(); break;
    case 'sync': content = renderSync(); break;
    case 'subscription': content = renderSubscription(); break;
    case 'settings': content = renderSettings(); break;
    default: content = renderDashboard();
  }

  return (
    <SafeAreaView style={styles.appRoot} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <View style={styles.brandMark}><Text style={styles.brandGlyph}>B</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandName}>BeBoss</Text>
          <Text numberOfLines={1} style={styles.brandShop}>{profile.shopName} · {actor.role}</Text>
        </View>
        <Pressable onPress={logout} style={styles.avatar}><Text style={styles.avatarText}>{actor.name.slice(0, 1).toUpperCase()}</Text></Pressable>
      </View>
      <View style={styles.messageArea}><Message error={error} notice={notice} onDismiss={() => { setError(''); setNotice(''); }} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        {content}
      </ScrollView>
      {screen === 'pos' ? null : null}
      <View style={styles.bottomNav}>
        {nav.map(item => (
          <Pressable key={item.key} style={styles.navItem} onPress={() => { setScreen(item.key); setSearch(''); setError(''); }}>
            <Text style={[styles.navGlyph, screen === item.key && styles.navActive]}>{item.glyph}</Text>
            <Text style={[styles.navLabel, screen === item.key && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.navItem} onPress={() => setScreen('reports')}>
          <Text style={[styles.navGlyph, screen === 'reports' && styles.navActive]}>▥</Text>
          <Text style={[styles.navLabel, screen === 'reports' && styles.navLabelActive]}>Reports</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => setScreen('settings')}>
          <Text style={[styles.navGlyph, screen === 'settings' && styles.navActive]}>⚙</Text>
          <Text style={[styles.navLabel, screen === 'settings' && styles.navLabelActive]}>More</Text>
        </Pressable>
      </View>
      {screen === 'settings' ? (
        <View style={styles.moreShortcuts}>
          {[
            ['Purchases', 'purchases'], ['Branches', 'branches'], ['Staff', 'staff'],
            ['Sync', 'sync'], ['Subscription', 'subscription']
          ].map(([label, key]) => (
            <Pressable key={key} onPress={() => setScreen(key as Screen)}><Text style={styles.moreShortcut}>{label}</Text></Pressable>
          ))}
        </View>
      ) : null}
      <Modal visible={modal !== null && modal !== 'scanner'} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalShade}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle(modal)}</Text>
              <Pressable onPress={() => setModal(null)}><Text style={styles.close}>Close</Text></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
              {modal === 'product' ? <>
                <Field label="Product name" value={form.name || ''} onChangeText={value => setForm({ ...form, name: value })} />
                <Field label="Category" value={form.category || ''} onChangeText={value => setForm({ ...form, category: value })} />
                <Field label="Barcode / SKU" value={form.barcode || ''} onChangeText={value => setForm({ ...form, barcode: value })} />
                <Field label="Unit" value={form.unit || ''} onChangeText={value => setForm({ ...form, unit: value })} />
                <Field label="Selling price" value={form.sellingPrice || ''} onChangeText={value => setForm({ ...form, sellingPrice: value })} keyboardType="decimal-pad" />
                <Field label="Cost price" value={form.costPrice || ''} onChangeText={value => setForm({ ...form, costPrice: value })} keyboardType="decimal-pad" />
                <Field label="Opening stock" value={form.quantityInStock || ''} onChangeText={value => setForm({ ...form, quantityInStock: value })} keyboardType="decimal-pad" />
                <Field label="Low stock threshold" value={form.lowStockThreshold || ''} onChangeText={value => setForm({ ...form, lowStockThreshold: value })} keyboardType="decimal-pad" />
                <SelectChips label="Branch" values={(snapshot?.branches || []).map(item => ({ label: item.name, value: item.id }))} value={form.branchId || ''} onChange={value => setForm({ ...form, branchId: value })} />
                <ButtonPrimary title="Save product" onPress={saveProductForm} loading={busy} />
              </> : null}
              {modal === 'adjust' ? <>
                <Field label="Quantity change (negative removes stock)" value={form.quantity || ''} onChangeText={value => setForm({ ...form, quantity: value })} keyboardType="decimal-pad" />
                <Field label="Reason" value={form.reason || ''} onChangeText={value => setForm({ ...form, reason: value })} />
                <ButtonPrimary title="Record stock adjustment" onPress={saveStockAdjustment} loading={busy} />
              </> : null}
              {modal === 'customer' ? <>
                <Field label="Customer name" value={form.name || ''} onChangeText={value => setForm({ ...form, name: value })} />
                <Field label="Phone" value={form.phone || ''} onChangeText={value => setForm({ ...form, phone: value })} keyboardType="phone-pad" />
                <Field label="Email" value={form.email || ''} onChangeText={value => setForm({ ...form, email: value })} keyboardType="email-address" />
                <Field label="Address" value={form.address || ''} onChangeText={value => setForm({ ...form, address: value })} />
                <Field label="City" value={form.city || ''} onChangeText={value => setForm({ ...form, city: value })} />
                <Field label="Credit limit" value={form.creditLimit || ''} onChangeText={value => setForm({ ...form, creditLimit: value })} keyboardType="decimal-pad" />
                <Field label="Notes" value={form.notes || ''} onChangeText={value => setForm({ ...form, notes: value })} />
                <ButtonPrimary title="Save customer" onPress={saveCustomerForm} loading={busy} />
              </> : null}
              {modal === 'payment' ? <>
                <Text style={styles.rowSub}>Outstanding: {money(snapshot?.customers.find(item => item.id === selectedCustomerId)?.debtBalance || 0, currency)}</Text>
                <Field label="Amount received" value={form.amount || ''} onChangeText={value => setForm({ ...form, amount: value })} keyboardType="decimal-pad" />
                <SelectChips label="Payment method" values={['CASH', 'MOMO', 'BANK', 'CARD'].map(value => ({ label: value, value }))} value={form.method || 'CASH'} onChange={value => setForm({ ...form, method: value })} />
                <Field label="Reference / note" value={form.note || ''} onChangeText={value => setForm({ ...form, note: value })} />
                <ButtonPrimary title="Record customer payment" onPress={saveCustomerPayment} loading={busy} />
              </> : null}
              {modal === 'quickSale' ? <>
                <Text style={styles.muted}>Record a one-off service or custom item without creating a stock product. The sale, receipt, cost estimate and audit entry are committed atomically.</Text>
                <Field label="Description" value={form.description || ''} onChangeText={value => setForm({ ...form, description: value })} />
                <Field label="Amount" value={form.amount || ''} onChangeText={value => setForm({ ...form, amount: value })} keyboardType="decimal-pad" />
                <SelectChips label="Payment method" values={['CASH', 'MOMO', 'AIRTEL', 'CARD', 'BANK'].map(value => ({ label: value, value }))} value={form.paymentMethod || 'CASH'} onChange={value => setForm({ ...form, paymentMethod: value })} />
                <ButtonPrimary title="Complete quick sale" onPress={saveQuickSale} loading={busy} />
              </> : null}
              {modal === 'checkout' ? <>
                <Metric label="Subtotal" value={money(cartSubtotal, currency)} />
                <Field label="Discount" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
                <SelectChips label="Customer" values={[{ label: 'Walk-in customer', value: '' }, ...(snapshot?.customers || []).map(item => ({ label: item.name, value: item.id }))]} value={customerChoice} onChange={setCustomerChoice} />
                <SelectChips label="Payment method" values={['CASH', 'MOMO', 'AIRTEL', 'CARD', 'SPLIT', 'CREDIT_DEBT'].map(value => ({ label: value.replace('_', ' '), value }))} value={paymentMethod} onChange={value => {
                  setPaymentMethod(value);
                  if (value === 'CREDIT_DEBT') setPaid('0');
                  else if (value === 'SPLIT') {
                    const half = Math.round(checkoutTotal * 50) / 100;
                    setSplitCash(String(half));
                    setSplitMomo(String(Math.round((checkoutTotal - half) * 100) / 100));
                  } else setPaid(String(checkoutTotal));
                }} />
                {paymentMethod === 'SPLIT' ? <>
                  <Text style={styles.fieldLabel}>Enter each part of the split payment. Both methods are recorded on the receipt.</Text>
                  <Field label="Cash amount" value={splitCash} onChangeText={setSplitCash} keyboardType="decimal-pad" />
                  <Field label="Mobile Money amount" value={splitMomo} onChangeText={setSplitMomo} keyboardType="decimal-pad" />
                  <Metric label="Total received" value={money(Number(splitCash || 0) + Number(splitMomo || 0), currency)} />
                </> : null}
                {paymentMethod !== 'CREDIT_DEBT' && paymentMethod !== 'SPLIT' ? <Field label="Amount paid" value={paid} onChangeText={setPaid} keyboardType="decimal-pad" /> : null}
                <Metric label="Amount due" value={money(Math.max(0, checkoutTotal - (paymentMethod === 'CREDIT_DEBT' ? 0 : paymentMethod === 'SPLIT' ? Number(splitCash || 0) + Number(splitMomo || 0) : Number(paid || 0))), currency)} tone="amber" />
                <ButtonPrimary title="Confirm and save sale" onPress={finishCheckout} loading={busy} />
                <Text style={styles.muted}>Checkout re-reads every product from the encrypted database, validates stock and branch ownership, checks credit limits, then writes the receipt, sale lines, stock changes, customer balance and sync outbox in one transaction.</Text>
              </> : null}
              {modal === 'purchase' ? <>
                <SelectChips label="Product" values={(snapshot?.products || []).map(item => ({ label: item.name, value: item.id }))} value={form.productId || ''} onChange={value => setForm({ ...form, productId: value })} />
                <Field label="Quantity received" value={form.quantity || ''} onChangeText={value => setForm({ ...form, quantity: value })} keyboardType="decimal-pad" />
                <Field label="Unit cost" value={form.unitCostPrice || ''} onChangeText={value => setForm({ ...form, unitCostPrice: value })} keyboardType="decimal-pad" />
                <Field label="New selling price (optional)" value={form.newSellingPrice || ''} onChangeText={value => setForm({ ...form, newSellingPrice: value })} keyboardType="decimal-pad" />
                <Field label="Supplier" value={form.supplierName || ''} onChangeText={value => setForm({ ...form, supplierName: value })} />
                <Field label="Supplier phone" value={form.supplierPhone || ''} onChangeText={value => setForm({ ...form, supplierPhone: value })} keyboardType="phone-pad" />
                <Field label="Invoice number" value={form.invoiceNumber || ''} onChangeText={value => setForm({ ...form, invoiceNumber: value })} />
                <SelectChips label="Payment status" values={['PAID_CASH', 'PAID_MOMO', 'PAID_BANK', 'SUPPLIER_CREDIT'].map(value => ({ label: value, value }))} value={form.paymentStatus || 'PAID_CASH'} onChange={value => setForm({ ...form, paymentStatus: value })} />
                <Field label="Notes" value={form.notes || ''} onChangeText={value => setForm({ ...form, notes: value })} />
                <ButtonPrimary title="Record purchase" onPress={savePurchaseForm} loading={busy} />
              </> : null}
              {modal === 'branch' ? <>
                <Field label="Branch name" value={form.name || ''} onChangeText={value => setForm({ ...form, name: value })} />
                <Field label="Branch code" value={form.code || ''} onChangeText={value => setForm({ ...form, code: value })} />
                <SelectChips label="Location type" values={['STORE', 'WAREHOUSE'].map(value => ({ label: value, value }))} value={form.locationType || 'STORE'} onChange={value => setForm({ ...form, locationType: value })} />
                <Field label="Address" value={form.address || ''} onChangeText={value => setForm({ ...form, address: value })} />
                <Field label="Phone" value={form.phone || ''} onChangeText={value => setForm({ ...form, phone: value })} />
                <Field label="Manager name" value={form.managerName || ''} onChangeText={value => setForm({ ...form, managerName: value })} />
                <SelectChips label="Operating status" values={['OPEN', 'PAUSED', 'CLOSED'].map(value => ({ label: value, value }))} value={form.operationalStatus || 'OPEN'} onChange={value => setForm({ ...form, operationalStatus: value })} />
                <SelectChips label="Main retail branch" values={[{ label: 'Standard branch', value: 'false' }, { label: 'Main retail branch', value: 'true' }]} value={form.isMainBranch || 'false'} onChange={value => setForm({ ...form, isMainBranch: value })} />
                <SelectChips label="Branch record" values={[{ label: 'Active', value: 'true' }, { label: 'Archived', value: 'false' }]} value={form.isActive || 'true'} onChange={value => setForm({ ...form, isActive: value })} />
                <Field label="Notes" value={form.notes || ''} onChangeText={value => setForm({ ...form, notes: value })} />
                <ButtonPrimary title="Save branch" onPress={saveBranchForm} loading={busy} />
              </> : null}
              {modal === 'transfer' ? <>
                <SelectChips label="Product" values={(snapshot?.products || []).map(item => ({ label: item.name, value: item.id }))} value={form.productId || ''} onChange={value => setForm({ ...form, productId: value })} />
                <SelectChips label="From branch" values={(snapshot?.branches || []).filter(item => item.isActive).map(item => ({ label: item.name, value: item.id }))} value={form.fromBranchId || ''} onChange={value => setForm({ ...form, fromBranchId: value })} />
                <SelectChips label="To branch" values={(snapshot?.branches || []).filter(item => item.isActive && item.id !== form.fromBranchId).map(item => ({ label: item.name, value: item.id }))} value={form.toBranchId || ''} onChange={value => setForm({ ...form, toBranchId: value })} />
                <Field label="Quantity to transfer" value={form.quantity || ''} onChangeText={value => setForm({ ...form, quantity: value })} keyboardType="decimal-pad" />
                <Field label="Notes" value={form.notes || ''} onChangeText={value => setForm({ ...form, notes: value })} />
                <ButtonPrimary title="Create transfer" onPress={saveTransfer} loading={busy} />
              </> : null}
              {modal === 'staff' ? <>
                <Field label="Full name" value={form.name || ''} onChangeText={value => setForm({ ...form, name: value })} />
                <Field label="Username" value={form.username || ''} autoCapitalize="none" onChangeText={value => setForm({ ...form, username: value })} />
                <Field label="Phone" value={form.phone || ''} onChangeText={value => setForm({ ...form, phone: value })} />
                <SelectChips label="Role preset" values={(['OWNER', 'MANAGER', 'CASHIER'] as Role[]).map(value => ({ label: value, value }))} value={form.role || 'CASHIER'} onChange={setStaffRole} />
                <Text style={styles.fieldLabel}>Individual access permissions · custom selections override the role preset</Text>
                <View style={styles.permissionGrid}>
                  {([
                    ['canSellPOS', 'Sell through POS'],
                    ['canApplyDiscounts', 'Apply discounts and price overrides'],
                    ['canManageInventory', 'Manage inventory and purchases'],
                    ['canViewCostAndProfit', 'View product cost and profit'],
                    ['canViewAnalytics', 'View business analytics'],
                    ['canManageCustomers', 'Manage customer records'],
                    ['canCollectDebt', 'Collect customer debt'],
                    ['canDeleteRecords', 'Archive and reverse records'],
                    ['canExportReports', 'Export reports'],
                    ['canManageCollaborators', 'Manage staff'],
                    ['canManageShopSettings', 'Manage shop and branches'],
                    ['canExportImportData', 'Export and restore backups']
                  ] as Array<[keyof Permissions, string]>).map(([key, label]) => (
                    <PermissionToggle
                      key={key}
                      label={label}
                      checked={form['permission_' + key] === 'true'}
                      onChange={checked => setForm(previous => ({ ...previous, ['permission_' + key]: String(checked) }))}
                    />
                  ))}
                </View>
                <SelectChips label="Assigned branch" values={[{ label: 'All branches', value: '' }, ...(snapshot?.branches || []).map(item => ({ label: item.name, value: item.id }))]} value={form.branchId || ''} onChange={value => setForm({ ...form, branchId: value })} />
                <Field label={editingStaff ? 'New PIN (leave blank to keep current)' : 'PIN'} value={form.pin || ''} secureTextEntry keyboardType="number-pad" onChangeText={value => setForm({ ...form, pin: value })} />
                <Field label={editingStaff ? 'New password (leave blank to keep current)' : 'Password'} value={form.password || ''} secureTextEntry onChangeText={value => setForm({ ...form, password: value })} />
                <SelectChips label="Account status" values={[{ label: 'Active', value: 'true' }, { label: 'Suspended', value: 'false' }]} value={form.isActive || 'true'} onChange={value => setForm({ ...form, isActive: value })} />
                <ButtonPrimary title="Save staff account" onPress={saveStaffForm} loading={busy} />
                <Text style={styles.muted}>iPhone staff records use the Android role permission matrix. Existing Android PIN/password hashes using the old APK pepper must be upgraded on the enrolled Android device or recovered through the verified owner pairing flow; that pepper is never copied into this app.</Text>
              </> : null}
              {modal === 'settings' ? <>
                <Field label="Shop name" value={form.shopName || ''} onChangeText={value => setForm({ ...form, shopName: value })} />
                <Field label="Owner name" value={form.ownerName || ''} onChangeText={value => setForm({ ...form, ownerName: value })} />
                <Field label="Phone" value={form.phone || ''} onChangeText={value => setForm({ ...form, phone: value })} />
                <Field label="Address" value={form.address || ''} onChangeText={value => setForm({ ...form, address: value })} />
                <Field label="Business type" value={form.businessType || ''} onChangeText={value => setForm({ ...form, businessType: value })} />
                <Field label="Currency code" value={form.currencyCode || ''} onChangeText={value => setForm({ ...form, currencyCode: value })} />
                <Field label="Currency symbol" value={form.currencySymbol || ''} onChangeText={value => setForm({ ...form, currencySymbol: value })} />
                <Field label="Tax rate (%)" value={form.taxRate || ''} onChangeText={value => setForm({ ...form, taxRate: value })} keyboardType="decimal-pad" />
                <Field label="Receipt header" value={form.receiptHeader || ''} onChangeText={value => setForm({ ...form, receiptHeader: value })} />
                <Field label="Receipt footer" value={form.receiptFooter || ''} onChangeText={value => setForm({ ...form, receiptFooter: value })} />
                <Field label="Default low-stock threshold" value={form.lowStockThresholdDefault || ''} onChangeText={value => setForm({ ...form, lowStockThresholdDefault: value })} keyboardType="decimal-pad" />
                <ButtonPrimary title="Save business settings" onPress={saveSettingsForm} loading={busy} />
              </> : null}
              {modal === 'backup' ? <>
                <Text style={styles.muted}>{backupMode === 'EXPORT'
                  ? 'Your backup contains shop records and sales, but never staff PIN/password hashes, subscription entitlements or cloud device credentials. AES-256-GCM encrypts the file with a key derived from your password.'
                  : 'Choose a BeBoss encrypted backup file and enter its password. The restore merges valid records into this shop; it does not erase existing records or replace staff credentials, subscription entitlements or device secrets.'}</Text>
                <Field label={backupMode === 'EXPORT' ? 'Backup password (minimum 12 characters)' : 'Backup password'} value={backupPassword} onChangeText={setBackupPassword} secureTextEntry />
                <ButtonPrimary title={backupMode === 'EXPORT' ? 'Encrypt and share backup' : 'Select and restore backup'} onPress={backupMode === 'EXPORT' ? saveBackup : restoreBackup} loading={busy} />
              </> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <BarcodeScannerModal visible={showScanner} onClose={() => setShowScanner(false)} onDetected={value => { setSearch(value); setCategory('All'); }} />
    </SafeAreaView>
  );
}

function modalTitle(modal: ModalName): string {
  switch (modal) {
    case 'product': return 'Product details';
    case 'adjust': return 'Stock adjustment';
    case 'customer': return 'Customer details';
    case 'payment': return 'Receive customer payment';
    case 'checkout': return 'Complete checkout';
    case 'quickSale': return 'Quick custom sale';
    case 'purchase': return 'Record purchase';
    case 'branch': return 'Branch details';
    case 'transfer': return 'New stock transfer';
    case 'staff': return 'Staff permissions';
    case 'settings': return 'Business settings';
    case 'backup': return 'Encrypted backup';
    default: return 'BeBoss';
  }
}

function LoadingView(): React.JSX.Element {
  return <SafeAreaView style={styles.loading}><View style={styles.brandMark}><Text style={styles.brandGlyph}>B</Text></View><Text style={styles.brandNameLarge}>BeBoss</Text><ActivityIndicator color={COLORS.orange} size="large" /><Text style={styles.muted}>Opening encrypted business database…</Text></SafeAreaView>;
}
function ErrorStartupView({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  return <AuthShell title="BeBoss could not start" subtitle="Your stored records have not been deleted.">
    <Text style={styles.errorText}>{message}</Text><ButtonPrimary title="Retry database startup" onPress={onRetry} />
  </AuthShell>;
}
function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }): React.JSX.Element {
  return <SafeAreaView style={styles.authRoot}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
      <View style={styles.brandHero}><View style={styles.brandMarkLarge}><Text style={styles.brandGlyphLarge}>B</Text></View><Text style={styles.brandNameLarge}>BeBoss</Text><Text style={styles.brandTag}>THE RETAIL OPERATING SYSTEM</Text></View>
      <View style={styles.authCard}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.subTitle}>{subtitle}</Text>{children}</View>
      <Text style={styles.legal}>Encrypted on this iPhone · Offline-ready workflows · Secure role-based access</Text>
    </ScrollView>
  </SafeAreaView>;
}
function Field(props: {
  label: string; value: string; onChangeText: (value: string) => void; secureTextEntry?: boolean;
  keyboardType?: any; autoCapitalize?: any; multiline?: boolean; editable?: boolean;
}): React.JSX.Element {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{props.label}</Text>
    <TextInput
      style={[styles.input, props.multiline && { minHeight: 86, textAlignVertical: 'top' }]}
      value={props.value}
      onChangeText={props.onChangeText}
      secureTextEntry={props.secureTextEntry}
      keyboardType={props.keyboardType || 'default'}
      autoCapitalize={props.autoCapitalize || 'sentences'}
      multiline={props.multiline}
      editable={props.editable !== false}
      placeholderTextColor={COLORS.muted}
    />
  </View>;
}
function ButtonPrimary({ title, onPress, loading, disabled }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean }): React.JSX.Element {
  return <Pressable onPress={onPress} disabled={disabled || loading} style={[styles.primaryButton, (disabled || loading) && { opacity: 0.45 }]}>
    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{title}</Text>}
  </Pressable>;
}
function ButtonSecondary({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }): React.JSX.Element {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.secondaryButton, disabled && { opacity: 0.4 }]}><Text style={styles.secondaryText}>{title}</Text></Pressable>;
}
function Message({ error, notice, onDismiss }: { error: string; notice: string; onDismiss?: () => void }): React.JSX.Element | null {
  if (!error && !notice) return null;
  return <Pressable onPress={onDismiss} style={[styles.message, error ? styles.errorMessage : styles.successMessage]}>
    <Text style={[styles.messageText, { color: error ? COLORS.red : COLORS.green }]}>{error || notice}</Text>
  </Pressable>;
}
function PageHeading({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }): React.JSX.Element {
  return <View style={styles.pageHeading}>
    <View style={{ flex: 1 }}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.subTitle}>{subtitle}</Text></View>
    {action && onAction ? <Pressable style={styles.smallAction} onPress={onAction}><Text style={styles.smallActionText}>{action}</Text></Pressable> : null}
  </View>;
}
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }): React.JSX.Element {
  return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action && onAction ? <Pressable onPress={onAction}><Text style={styles.actionLink}>{action}</Text></Pressable> : null}</View>;
}
function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'orange' | 'green' | 'red' | 'amber' }): React.JSX.Element {
  const tint = tone === 'green' ? COLORS.green : tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'orange' ? COLORS.orange : COLORS.ink;
  return <View style={styles.metricCard}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color: tint }]}>{value}</Text></View>;
}
function QuickAction({ title, glyph, onPress }: { title: string; glyph: string; onPress: () => void }): React.JSX.Element {
  return <Pressable onPress={onPress} style={styles.quickAction}><Text style={styles.quickGlyph}>{glyph}</Text><Text style={styles.quickTitle}>{title}</Text></Pressable>;
}
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }): React.JSX.Element {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}
function SelectChips({ label, values, value, onChange }: { label: string; values: Array<{ label: string; value: string }>; value: string; onChange: (value: string) => void }): React.JSX.Element {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{values.map(item =>
    <Chip key={item.value + item.label} label={item.label} selected={value === item.value} onPress={() => onChange(item.value)} />
  )}</ScrollView></View>;
}
function ProductRow({ product, currency, onPress }: { product: Product; currency: string; onPress?: () => void }): React.JSX.Element {
  return <Pressable style={styles.compactRow} onPress={onPress}>
    <View style={styles.productIconSmall}><Text style={styles.productIconText}>{product.name.slice(0, 1).toUpperCase()}</Text></View>
    <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{product.name}</Text><Text style={styles.rowSub}>Stock {product.quantityInStock} • {product.category}</Text></View>
    <Text style={styles.price}>{money(product.sellingPrice, currency)}</Text>
  </Pressable>;
}
function SaleRow({ sale, currency }: { sale: Sale; currency: string }): React.JSX.Element {
  return <View style={styles.compactRow}>
    <View style={styles.saleIcon}><Text style={styles.saleGlyph}>↗</Text></View>
    <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{sale.receiptNumber}</Text><Text style={styles.rowSub}>{sale.customerName} · {sale.paymentMethod}</Text>{sale.paymentBreakdown?.length ? <Text style={styles.rowSub}>{sale.paymentBreakdown.map(part => part.method + ' ' + money(part.amount, currency)).join(' + ')}</Text> : null}</View>
    <Text style={styles.price}>{money(sale.totalAmount, currency)}</Text>
  </View>;
}
function EmptyState({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }): React.JSX.Element {
  return <View style={styles.empty}><Text style={styles.emptyMark}>⌁</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.muted}>{subtitle}</Text>{action && onAction ? <ActionLink label={action} onPress={onAction} /> : null}</View>;
}
function ActionLink({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }): React.JSX.Element {
  return <Pressable onPress={onPress} disabled={disabled} style={{ paddingVertical: 5, opacity: disabled ? 0.35 : 1 }}><Text style={[styles.actionLink, danger && { color: COLORS.red }]}>{label}</Text></Pressable>;
}
function PermissionToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.permissionRow}
    >
      <View style={[styles.permissionBox, checked && styles.permissionBoxChecked]}>
        {checked ? <Text style={styles.permissionTick}>✓</Text> : null}
      </View>
      <Text style={styles.permissionLabel}>{label}</Text>
    </Pressable>
  );
}

function PrinterControls({ printer }: { printer: ReturnType<typeof useBluetoothPrinters> }): React.JSX.Element {
  return <View style={styles.card}>
    <Text style={styles.rowTitle}>{printer.connected ? 'Connected: ' + (printer.connected.name || printer.connected.id) : 'No BLE printer connected'}</Text>
    <Text style={styles.muted}>iOS supports Bluetooth LE accessories directly. Classic serial thermal printers may require an Apple MFi-certified accessory and compatible manufacturer protocol.</Text>
    <View style={styles.inlineActions}>
      <ButtonSecondary title={printer.scanning ? 'Stop scan' : 'Find BLE printer'} onPress={printer.scanning ? printer.stopScan : () => printer.scan().catch((e: any) => Alert.alert('Bluetooth', e.message))} />
      <ButtonSecondary title="Test print" onPress={() => printer.printText('BeBoss printer test\nDevice connected\n').then(() => Alert.alert('Printed', 'Test receipt sent.')).catch((e: any) => Alert.alert('Print failed', e.message))} disabled={!printer.connected} />
    </View>
    {printer.devices.map(item => <Pressable key={item.id} style={styles.compactRow} onPress={() => printer.connect(item.device).then(() => Alert.alert('Printer connected', item.name)).catch((e: any) => Alert.alert('Connection failed', e.message))}>
      <Text style={{ flex: 1, color: COLORS.ink }}>{item.name}</Text><Text style={styles.actionLink}>Connect</Text>
    </Pressable>)}
  </View>;
}

const COLORS = {
  canvas: '#F6F7F9', paper: '#FFFFFF', ink: '#17191D', sub: '#626B78', muted: '#9199A4',
  border: '#E6E9EE', orange: '#F36B2B', orangeSoft: '#FFF0E8', green: '#178A57',
  red: '#D34D4D', amber: '#B7791F', navy: '#18243A', navySoft: '#25334C'
};
const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: COLORS.canvas },
  loading: { flex: 1, backgroundColor: COLORS.canvas, alignItems: 'center', justifyContent: 'center', gap: 18 },
  authRoot: { flex: 1, backgroundColor: COLORS.canvas },
  authContent: { flexGrow: 1, padding: 22, justifyContent: 'center' },
  brandHero: { alignItems: 'center', paddingVertical: 28 },
  brandMarkLarge: { width: 76, height: 76, borderRadius: 23, backgroundColor: COLORS.orange, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 18, elevation: 7 },
  brandGlyphLarge: { fontSize: 48, fontWeight: '900', color: '#fff' },
  brandNameLarge: { color: COLORS.ink, fontSize: 30, fontWeight: '900', marginTop: 12, letterSpacing: -1 },
  brandTag: { color: COLORS.sub, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: 5 },
  authCard: { backgroundColor: COLORS.paper, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: COLORS.border, gap: 3 },
  legal: { textAlign: 'center', color: COLORS.muted, fontSize: 11, marginVertical: 20 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.orange, alignItems: 'center', justifyContent: 'center' },
  brandGlyph: { color: '#fff', fontSize: 25, fontWeight: '900' },
  brandName: { fontSize: 17, color: COLORS.ink, fontWeight: '900', letterSpacing: -0.5 },
  brandShop: { color: COLORS.sub, fontSize: 10, marginTop: 2 },
  topBar: { minHeight: 62, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: COLORS.canvas },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.navy },
  avatarText: { color: '#fff', fontWeight: '800' },
  messageArea: { paddingHorizontal: 14 },
  pageContent: { paddingHorizontal: 16, paddingBottom: 28 },
  greeting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 16 },
  eyebrow: { color: COLORS.orange, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  pageTitle: { fontSize: 24, fontWeight: '900', color: COLORS.ink, letterSpacing: -0.8, marginTop: 4 },
  subTitle: { fontSize: 12, color: COLORS.sub, lineHeight: 18, marginTop: 4 },
  statusPill: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 9, fontWeight: '800', color: COLORS.sub },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 13 },
  metricCard: { backgroundColor: COLORS.paper, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: 9, flexGrow: 1, flexBasis: '46%' },
  metricLabel: { color: COLORS.sub, fontSize: 11, fontWeight: '600' },
  metricValue: { color: COLORS.ink, fontSize: 17, fontWeight: '900', marginTop: 7 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  quickAction: { width: '48%', backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, padding: 13, minHeight: 85 },
  quickGlyph: { color: COLORS.orange, fontSize: 23, fontWeight: '800' },
  quickTitle: { color: COLORS.ink, fontWeight: '700', fontSize: 12, marginTop: 7 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 8 },
  sectionTitle: { color: COLORS.ink, fontWeight: '900', fontSize: 15, letterSpacing: -0.2 },
  actionLink: { color: COLORS.orange, fontSize: 12, fontWeight: '800' },
  pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 12, paddingBottom: 14 },
  smallAction: { backgroundColor: COLORS.orangeSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  smallActionText: { color: COLORS.orange, fontSize: 11, fontWeight: '800' },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.paper, borderRadius: 13, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 7 },
  productIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  productIconSmall: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  productIconText: { fontSize: 15, fontWeight: '900', color: COLORS.orange },
  saleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#E9F6EF', alignItems: 'center', justifyContent: 'center' },
  saleGlyph: { color: COLORS.green, fontWeight: '900', fontSize: 18 },
  rowTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800' },
  rowSub: { color: COLORS.sub, fontSize: 10, marginTop: 3, lineHeight: 15 },
  price: { color: COLORS.ink, fontSize: 12, fontWeight: '900' },
  warningText: { color: COLORS.amber, fontSize: 10, marginTop: 4, fontWeight: '900' },
  permissionGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 8 },
  permissionRow: { flexDirection: 'row', alignItems: 'center', width: '48%', minHeight: 40, gap: 8, paddingVertical: 4 },
  permissionBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper },
  permissionBoxChecked: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  permissionTick: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  permissionLabel: { flex: 1, fontSize: 10, fontWeight: '700', color: COLORS.ink },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  trendLabel: { width: 34, color: COLORS.sub, fontSize: 10, fontWeight: '700' },
  trendTrack: { height: 9, flex: 1, backgroundColor: COLORS.canvas, borderRadius: 6, overflow: 'hidden' },
  trendBar: { height: 9, minWidth: 0, borderRadius: 6, backgroundColor: COLORS.orange },
  trendValue: { width: 94, textAlign: 'right', color: COLORS.ink, fontSize: 10, fontWeight: '800' },
  inventoryCard: { flexDirection: 'row', backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border, padding: 13, borderRadius: 15, marginBottom: 8 },
  customerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.paper, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  card: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border, padding: 13, borderRadius: 15, marginBottom: 9 },
  heldCartChip: { backgroundColor: COLORS.navy, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, minWidth: 140, maxWidth: 220 },
  heldCartMeta: { color: '#D4DCE8', fontSize: 9, marginTop: 3 },
  heldCartAction: { color: '#F6A276', fontSize: 10, fontWeight: '900', marginTop: 5 },
  heldCartDelete: { color: '#FFC7C7', fontSize: 9, fontWeight: '800', marginTop: 5 },
  cartDock: { backgroundColor: COLORS.paper, borderTopWidth: 1, borderColor: COLORS.border, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 12 },
  cartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cartTitle: { fontWeight: '900', color: COLORS.ink, fontSize: 13 },
  cartTotal: { color: COLORS.orange, fontSize: 17, fontWeight: '900' },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 5 },
  qtyButton: { width: 30, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.orangeSoft },
  inlineActions: { flexDirection: 'row', gap: 8, marginTop: 9 },
  primaryButton: { minHeight: 47, backgroundColor: COLORS.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 13, marginTop: 10 },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  secondaryButton: { minHeight: 43, flex: 1, backgroundColor: COLORS.paper, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 },
  secondaryText: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  field: { marginTop: 10 },
  fieldLabel: { fontSize: 10, color: COLORS.sub, fontWeight: '800', marginBottom: 5 },
  input: { minHeight: 45, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: COLORS.ink, backgroundColor: '#FCFCFD' },
  muted: { fontSize: 10, color: COLORS.sub, lineHeight: 16, marginTop: 8 },
  errorText: { color: COLORS.red, fontWeight: '700', marginVertical: 10 },
  message: { borderRadius: 10, padding: 9, marginBottom: 6, borderWidth: 1 },
  errorMessage: { backgroundColor: '#FFF1F1', borderColor: '#F8D0D0' },
  successMessage: { backgroundColor: '#EFFAF3', borderColor: '#D3EDDD' },
  messageText: { fontSize: 11, fontWeight: '700', lineHeight: 16 },
  scanButton: { width: 48, height: 46, borderRadius: 12, backgroundColor: COLORS.orangeSoft, justifyContent: 'center', alignItems: 'center' },
  scanGlyph: { color: COLORS.orange, fontSize: 24, fontWeight: '900' },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chipRow: { flexDirection: 'row', gap: 7, paddingVertical: 9 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border },
  chipSelected: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  chipText: { color: COLORS.sub, fontSize: 10, fontWeight: '700' },
  chipTextSelected: { color: '#fff' },
  posProduct: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderBottomWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.paper },
  empty: { padding: 28, alignItems: 'center', backgroundColor: COLORS.paper, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 },
  emptyMark: { color: COLORS.orange, fontSize: 34, fontWeight: '900' },
  emptyTitle: { color: COLORS.ink, fontWeight: '900', fontSize: 14, marginTop: 7 },
  bottomNav: { flexDirection: 'row', backgroundColor: COLORS.paper, borderTopWidth: 1, borderColor: COLORS.border, paddingHorizontal: 5, paddingTop: 7, paddingBottom: 5 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 44 },
  navGlyph: { color: COLORS.muted, fontSize: 20, fontWeight: '800' },
  navActive: { color: COLORS.orange },
  navLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  navLabelActive: { color: COLORS.orange },
  moreShortcuts: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.navy, paddingVertical: 8 },
  moreShortcut: { color: '#fff', fontSize: 10, fontWeight: '800' },
  modalShade: { flex: 1, backgroundColor: 'rgba(10,15,24,0.42)', justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '92%', backgroundColor: COLORS.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.ink },
  close: { color: COLORS.orange, fontWeight: '800', fontSize: 12 },
  modalContent: { paddingBottom: 24 },
  noticeCard: { backgroundColor: COLORS.navy, borderRadius: 15, padding: 15, marginVertical: 8 },
  noticeHeading: { color: '#fff', fontWeight: '900', fontSize: 14 },
  scanRoot: { flex: 1, backgroundColor: '#090C11' },
  scanHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 18, paddingTop: 60, zIndex: 2 },
  scanTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  scanMessage: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 26 },
  scanText: { color: '#fff', textAlign: 'center', fontSize: 13 },
  action: { backgroundColor: COLORS.orange, padding: 12, borderRadius: 10, marginTop: 12 },
  actionText: { color: '#fff', fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFill, top: 70 }
});

export default function App(): React.JSX.Element {
  return <SafeAreaProvider><AppRoot /></SafeAreaProvider>;
}
