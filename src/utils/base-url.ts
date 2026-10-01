import Constants from 'expo-constants';

/** 部署子路徑（GitHub Pages 為 /ReadingDiary），來自 app.json 的 experiments.baseUrl。 */
export const BASE_URL: string = Constants.expoConfig?.experiments?.baseUrl ?? '';
