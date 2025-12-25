import { printToFileAsync } from 'expo-print';
import { shareAsync } from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

interface InventoryItem {
  id: string;
  room_name: string;
  created_at: string;
  ai_analysis: any; 
}

interface RoomSection {
  title: string;
  data: InventoryItem[];
}

export async function generateAndShareReport(inventory: RoomSection[]) {
  const html = `
    <html>
      <head>
        <style>
          body { font-family: Helvetica, sans-serif; padding: 20px; }
          h1 { text-align: center; }
          h2 { border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 30px; }
          h3 { color: #666; margin-top: 15px; margin-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>Property Inventory Report</h1>
        <p style="text-align: center; color: #666;">Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
        
        ${inventory.map(section => `
          <h2>${section.title}</h2>
          ${section.data.map(item => {
             // Parse items logic matching app logic
             let items: any[] = [];
             if (Array.isArray(item.ai_analysis)) {
               items = item.ai_analysis;
             } else if (item.ai_analysis && typeof item.ai_analysis === 'object' && Array.isArray(item.ai_analysis.items)) {
               items = item.ai_analysis.items;
             }
             
             const location = (item.ai_analysis && item.ai_analysis.location) ? item.ai_analysis.location : '';
             
             if (items.length === 0) return `<p><em>No items recorded for this scan.</em></p>`;

             return `
               <h3>${location ? `Location: ${location}` : 'Scan'} <span style="font-weight: normal; font-size: 0.8em;">(${new Date(item.created_at).toLocaleDateString()})</span></h3>
               <table>
                 <tr>
                   <th>Item</th>
                   <th>Count</th>
                   <th>Condition</th>
                 </tr>
                 ${items.map((i: any) => `
                   <tr>
                     <td>${i.name}</td>
                     <td>${i.count}</td>
                     <td>${i.condition}</td>
                   </tr>
                 `).join('')}
               </table>
             `;
          }).join('')}
        `).join('')}
      </body>
    </html>
  `;

  try {
    const { uri } = await printToFileAsync({ html });
    
    // Format date for filename (YYYY-MM-DD_HH-mm)
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-').slice(0, 5);
    const fileName = `Inventory_Report_${dateStr}_${timeStr}.pdf`;
    
    const newUri = FileSystem.documentDirectory + fileName;
    
    await FileSystem.moveAsync({
      from: uri,
      to: newUri
    });

    await shareAsync(newUri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: fileName });
  } catch (error) {
    console.error('Error generating PDF:', error);
  }
}
