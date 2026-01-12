// frontend/src/api/widgetPreferences.ts
import api from "./axios";

export interface WidgetPreferences {
  order: string[];
  widgets: Record<string, { id: string; type: string; title: string; size: "sm" | "lg" }>;
}

export const fetchWidgetPreferences = async (): Promise<WidgetPreferences> => {
  const { data } = await api.get<WidgetPreferences>("/widget-preferences");
  return data;
};

export const saveWidgetPreferences = async (preferences: WidgetPreferences): Promise<WidgetPreferences> => {
  const { data } = await api.put<WidgetPreferences>("/widget-preferences", preferences);
  return data;
};
