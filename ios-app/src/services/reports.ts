import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { Branch, Product, Sale, ShopProfile } from '../core/types';

function cell(value: unknown): string {
  const text = String(value ?? '');
  return '"' + text.replace(/"/g, '""') + '"';
}

async function saveAndShareCsv(name: string, rows: unknown[][]): Promise<string> {
  const csv = '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
  const path = RNFS.DocumentDirectoryPath + '/' + name + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
  await RNFS.writeFile(path, csv, 'utf8');
  await Share.open({ url: 'file://' + path, type: 'text/csv', title: 'Export BeBoss report' });
  return path;
}

export async function exportSalesCsv(sales: Sale[], profile: ShopProfile): Promise<string> {
  const rows: unknown[][] = [[
    'Receipt', 'Date', 'Shop', 'Branch', 'Cashier', 'Customer', 'Payment method',
    'Payment breakdown', 'Payment status', 'Subtotal', 'Discount', 'Total',
    'Paid', 'Outstanding', 'Cost', 'Profit', 'Notes'
  ]];
  for (const sale of sales) {
    rows.push([
      sale.receiptNumber, new Date(sale.saleDate).toISOString(), profile.shopName,
      sale.branchName, sale.cashierName, sale.customerName, sale.paymentMethod,
      sale.paymentBreakdown?.map(part => part.method + ':' + part.amount).join(' | ') || '',
      sale.paymentStatus, sale.totalAmount + sale.discountAmount, sale.discountAmount,
      sale.totalAmount, sale.amountPaid, Math.max(0, sale.totalAmount - sale.amountPaid),
      sale.totalCost, sale.totalProfit, sale.notes
    ]);
  }
  rows.push([]);
  rows.push(['Receipt line items']);
  rows.push(['Receipt', 'Product', 'Category', 'Unit', 'Quantity', 'Unit price', 'Line total', 'Cost', 'Profit', 'Branch']);
  for (const sale of sales) {
    for (const line of sale.items) {
      rows.push([
        sale.receiptNumber, line.productName, line.category, line.unit,
        line.quantitySold, line.unitPriceAtSale, line.subtotal,
        line.costPriceAtSale * line.quantitySold, line.profit, line.branchId
      ]);
    }
  }
  return saveAndShareCsv('BeBoss_sales_report', rows);
}

export async function exportInventoryCsv(products: Product[], branches: Branch[], profile: ShopProfile): Promise<string> {
  const branchNames = new Map(branches.map(branch => [branch.id, branch.name]));
  const rows: unknown[][] = [[
    'Shop', 'Product ID', 'Product', 'Barcode', 'Category', 'Unit', 'Branch',
    'Selling price', 'Cost price', 'Stock quantity', 'Stock cost value',
    'Reorder level', 'Low stock', 'Archived', 'Updated'
  ]];
  for (const product of products) {
    rows.push([
      profile.shopName, product.id, product.name, product.barcode, product.category,
      product.unit, branchNames.get(product.branchId) || product.branchId,
      product.sellingPrice, product.costPrice, product.quantityInStock,
      product.costPrice * product.quantityInStock, product.lowStockThreshold,
      product.quantityInStock <= product.lowStockThreshold ? 'YES' : 'NO',
      product.isDeleted ? 'YES' : 'NO', new Date(product.updatedAt).toISOString()
    ]);
  }
  return saveAndShareCsv('BeBoss_inventory_report', rows);
}
