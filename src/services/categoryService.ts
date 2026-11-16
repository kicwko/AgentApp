import apiClient, { ApiResponse } from './apiClient';
import { API_CONFIG } from '../config/api';

export interface Category {
  _id: string;
  name: string;
  code: string;
  icon?: string;
  skills?: string[];
  fleetCount?: number;
  sla?: string;
  mode?: string;
  pricingTier?: string;
  basePrice?: string;
  commission?: string;
  status?: string;
  compliance?: string;
  isActive?: boolean;
  surge?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const categoryService = {
  // Fetch all service categories from MongoDB
  getCategories: async (): Promise<ApiResponse<Category[]>> => {
    return apiClient.get<Category[]>(API_CONFIG.endpoints.categories);
  },

  // Create a new category
  createCategory: async (categoryData: Partial<Category>): Promise<ApiResponse<Category>> => {
    return apiClient.post<Category>(API_CONFIG.endpoints.categories, categoryData);
  },

  // Update category by ID
  updateCategory: async (
    categoryId: string,
    categoryData: Partial<Category>
  ): Promise<ApiResponse<Category>> => {
    return apiClient.put<Category>(
      `${API_CONFIG.endpoints.categories}/${categoryId}`,
      categoryData
    );
  },

  // Delete category
  deleteCategory: async (categoryId: string): Promise<ApiResponse<any>> => {
    return apiClient.delete(`${API_CONFIG.endpoints.categories}/${categoryId}`);
  },
};

export default categoryService;

