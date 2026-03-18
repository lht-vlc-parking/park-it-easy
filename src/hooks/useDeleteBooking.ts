import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookingService } from '@/services/bookingService';

export function useDeleteBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const result = await BookingService.cancelBooking(bookingId);
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to cancel booking');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
