import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Car, Bike, Clock, Sun, Sunset, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DURATION_PRESETS, type Duration } from '@/services/bookingService';

interface BookingDialogWithValidationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spotNumber: number;
  onConfirm: (booking: {
    date: string;
    duration: Duration;
    start_time: string;
    end_time: string;
    vehicle_type: 'car' | 'motorcycle';
    spot_number: number;
  }) => void;
}

export const BookingDialogWithValidation = ({
  open,
  onOpenChange,
  spotNumber,
  onConfirm,
}: BookingDialogWithValidationProps) => {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>();
  const [duration, setDuration] = useState<Duration>('full');
  const [startTime, setStartTime] = useState(DURATION_PRESETS.full.start_time);
  const [endTime, setEndTime] = useState(DURATION_PRESETS.full.end_time);
  const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>('car');
  const [isValidating, setIsValidating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Prefill today's date when dialog opens
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDate(new Date(new Date().setHours(0, 0, 0, 0)));
    }
  }, [open]);

  const handleDurationChange = (value: Duration) => {
    setDuration(value);
    setStartTime(DURATION_PRESETS[value].start_time);
    setEndTime(DURATION_PRESETS[value].end_time);
  };

  const handleSubmit = async () => {
    if (!date) {
      toast.error('Please select a date');
      return;
    }

    if (!user) {
      toast.error('You must be logged in to book');
      return;
    }

    if (endTime <= startTime) {
      toast.error('End time must be after start time');
      return;
    }

    setIsValidating(true);
    const selectedDateStr = format(date, 'yyyy-MM-dd');

    try {
      // Check if user already has a booking on this date
      const { data: userBookings, error: userError } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', selectedDateStr);

      if (userError) throw userError;

      if (userBookings && userBookings.length > 0) {
        const existingBooking = userBookings[0];
        toast.error(
          `You already have a booking on this date (Spot ${existingBooking.spot_number}, ${existingBooking.vehicle_type === 'car' ? '🚗 Car' : '🏍️ Motorcycle'})`
        );
        setIsValidating(false);
        return;
      }

      // All pre-validation passed — delegate conflict validation to the service via onConfirm
      onConfirm({
        date: selectedDateStr,
        duration,
        start_time: startTime,
        end_time: endTime,
        vehicle_type: vehicleType,
        spot_number: spotNumber,
      });

      // Reset form
      setDate(undefined);
      handleDurationChange('full');
      setVehicleType('car');
      onOpenChange(false);
    } catch (error) {
      console.error('Error validating booking:', error);
      toast.error('Failed to validate booking. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden border-2 p-0 shadow-2xl sm:max-w-[500px]">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="gradient-primary flex h-8 w-8 items-center justify-center rounded-lg">
              <CalendarIcon className="h-4 w-4 text-white" />
            </div>
            Book Spot {spotNumber}
          </DialogTitle>
          <DialogDescription>
            Fill in the details to reserve your parking spot. You can only have one booking per day.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Select Date</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'hover:border-primary/50 h-12 w-full justify-start border-2 text-left font-normal transition-all',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="text-primary mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={d => {
                    setDate(d);
                    setCalendarOpen(false);
                  }}
                  disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  autoFocus
                  weekStartsOn={1}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Vehicle Type</Label>
            <RadioGroup
              value={vehicleType}
              onValueChange={v => setVehicleType(v as 'car' | 'motorcycle')}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="car"
                className={cn(
                  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all',
                  vehicleType === 'car'
                    ? 'border-primary bg-primary/10 shadow-primary/10 shadow-lg'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                <RadioGroupItem value="car" id="car" className="hidden" />
                <div className="flex flex-col items-center gap-2">
                  <Car
                    className={cn(
                      'h-8 w-8',
                      vehicleType === 'car' ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <span className={cn('font-medium', vehicleType === 'car' && 'text-primary')}>
                    Car
                  </span>
                </div>
              </Label>
              <Label
                htmlFor="motorcycle"
                className={cn(
                  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all',
                  vehicleType === 'motorcycle'
                    ? 'border-accent bg-accent/10 shadow-accent/10 shadow-lg'
                    : 'border-border hover:border-accent/50 hover:bg-muted/50'
                )}
              >
                <RadioGroupItem value="motorcycle" id="motorcycle" className="hidden" />
                <div className="flex flex-col items-center gap-2">
                  <Bike
                    className={cn(
                      'h-8 w-8',
                      vehicleType === 'motorcycle' ? 'text-accent' : 'text-muted-foreground'
                    )}
                  />
                  <span
                    className={cn('font-medium', vehicleType === 'motorcycle' && 'text-accent')}
                  >
                    Motorcycle
                  </span>
                </div>
              </Label>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Duration Preset</Label>
            <RadioGroup
              value={duration}
              onValueChange={v => handleDurationChange(v as Duration)}
              className="space-y-2"
            >
              <div
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all',
                  duration === 'full'
                    ? 'border-primary bg-primary/10 shadow-md'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                <RadioGroupItem value="full" id="full" />
                <Label htmlFor="full" className="flex flex-1 cursor-pointer items-center gap-3">
                  <Clock
                    className={cn(
                      'h-5 w-5',
                      duration === 'full' ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <div>
                    <div className="font-medium">Full Day</div>
                    <div className="text-muted-foreground text-xs">
                      {DURATION_PRESETS.full.start_time} – {DURATION_PRESETS.full.end_time}
                    </div>
                  </div>
                </Label>
              </div>
              <div
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all',
                  duration === 'morning'
                    ? 'border-info bg-info/10 shadow-md'
                    : 'border-border hover:border-info/50 hover:bg-muted/50'
                )}
              >
                <RadioGroupItem value="morning" id="morning" />
                <Label htmlFor="morning" className="flex flex-1 cursor-pointer items-center gap-3">
                  <Sun
                    className={cn(
                      'h-5 w-5',
                      duration === 'morning' ? 'text-info' : 'text-muted-foreground'
                    )}
                  />
                  <div>
                    <div className="font-medium">Morning</div>
                    <div className="text-muted-foreground text-xs">
                      {DURATION_PRESETS.morning.start_time} – {DURATION_PRESETS.morning.end_time}
                    </div>
                  </div>
                </Label>
              </div>
              <div
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all',
                  duration === 'afternoon'
                    ? 'border-warning bg-warning/10 shadow-md'
                    : 'border-border hover:border-warning/50 hover:bg-muted/50'
                )}
              >
                <RadioGroupItem value="afternoon" id="afternoon" />
                <Label
                  htmlFor="afternoon"
                  className="flex flex-1 cursor-pointer items-center gap-3"
                >
                  <Sunset
                    className={cn(
                      'h-5 w-5',
                      duration === 'afternoon' ? 'text-warning' : 'text-muted-foreground'
                    )}
                  />
                  <div>
                    <div className="font-medium">Afternoon</div>
                    <div className="text-muted-foreground text-xs">
                      {DURATION_PRESETS.afternoon.start_time} –{' '}
                      {DURATION_PRESETS.afternoon.end_time}
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Custom time override */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              Time Range
              <span className="text-muted-foreground ml-1 text-xs font-normal">
                (adjust if needed)
              </span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="start_time" className="text-muted-foreground text-xs">
                  Start
                </Label>
                <Input
                  id="start_time"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end_time" className="text-muted-foreground text-xs">
                  End
                </Label>
                <Input
                  id="end_time"
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-12 flex-1"
            disabled={isValidating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="gradient-primary shadow-primary/30 hover:shadow-primary/50 h-12 flex-1 font-semibold text-white shadow-lg transition-all"
            disabled={isValidating}
          >
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              'Confirm Booking'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
