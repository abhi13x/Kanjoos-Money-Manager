import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { Calendar } from 'lucide-react';

interface DatePickerProps {
  date: string;
  setDate: (date: string) => void;
}

export const DatePicker: React.FC<DatePickerProps> = ({ date, setDate }) => {
  return (
    <TextField
      type="date"
      label="Date"
      value={date}
      onChange={(e) => setDate(e.target.value)}
      required
      fullWidth
      slotProps={{
        inputLabel: { shrink: true },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Calendar size={18} aria-hidden />
            </InputAdornment>
          ),
          sx: { borderRadius: '14px' }
        }
      }}
    />
  );
};

export default DatePicker;