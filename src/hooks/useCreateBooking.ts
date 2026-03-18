import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookingService, type CreateBookingData } from '@/services/bookingService';

interface CreateBookingParams extends CreateBookingData {
  userId: string;
  userName: string;
}

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, userName, ...data }: CreateBookingParams) => {
      const result = await BookingService.createBooking(data, userId, userName);
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to create booking');
      }
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
