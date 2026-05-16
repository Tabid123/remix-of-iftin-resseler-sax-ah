import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeviceRegistrationRequest {
  deviceId: string
  deviceName: string
  sim1Number?: string
  sim2Number?: string
}

// Map SIM numbers to providers based on carrier patterns
function getProviderFromSimNumber(simNumber: string): string {
  if (simNumber.startsWith('619') || simNumber.startsWith('61619')) {
    return 'hormuud'
  } else if (simNumber.startsWith('615') || simNumber.startsWith('61615')) {
    return 'somnet'
  } else if (simNumber.startsWith('634') || simNumber.startsWith('61634')) {
    return 'somtel'
  } else {
    return 'unknown'
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const requestData: DeviceRegistrationRequest = await req.json()
    console.log('Device registration request:', requestData)

    const { deviceId, deviceName, sim1Number, sim2Number } = requestData

    if (!deviceId) {
      return new Response(
        JSON.stringify({ error: 'Device ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Update or create in 'devices' table (simple table for backward compatibility)
    const { data: existingDevice, error: checkError } = await supabase
      .from('devices')
      .select('*')
      .eq('device_id', deviceId)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking existing device:', checkError)
      throw checkError
    }

    let device
    if (existingDevice) {
      const { data: updatedDevice, error: updateError } = await supabase
        .from('devices')
        .update({
          device_name: deviceName,
          sim1_number: sim1Number || existingDevice.sim1_number,
          sim2_number: sim2Number || existingDevice.sim2_number,
          last_seen: new Date().toISOString(),
          is_active: true
        })
        .eq('device_id', deviceId)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating device:', updateError)
        throw updateError
      }
      device = updatedDevice
      console.log('Device updated in devices table:', device)
    } else {
      const { data: newDevice, error: insertError } = await supabase
        .from('devices')
        .insert({
          device_id: deviceId,
          device_name: deviceName,
          sim1_number: sim1Number,
          sim2_number: sim2Number,
          last_seen: new Date().toISOString(),
          is_active: true
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error registering device:', insertError)
        throw insertError
      }
      device = newDevice
      console.log('Device registered in devices table:', device)
    }

    // 2. Update or create in 'android_devices' table (per-SIM entries for admin dashboard)
    const androidDevices = []
    
    // Helper function to process a SIM - auto-sync device_id by device_name if exists
    async function processSim(simNumber: string, simLabel: string) {
      const provider = getProviderFromSimNumber(simNumber)
      console.log(`Processing ${simLabel}: ${simNumber} -> Provider: ${provider}`)
      
      // First, check if there's an existing entry with same device_id and sim_number
      const { data: existingByDeviceId } = await supabase
        .from('android_devices')
        .select('*')
        .eq('device_id', deviceId)
        .eq('sim_number', simNumber)
        .maybeSingle()

      if (existingByDeviceId) {
        // Update existing record by device_id
        const { data: updated, error: updateError } = await supabase
          .from('android_devices')
          .update({
            device_name: deviceName,
            provider_name: provider,
            last_ping_at: new Date().toISOString(),
            is_active: true,
            archived_at: null
          })
          .eq('id', existingByDeviceId.id)
          .select()
          .single()

        if (updateError) {
          console.error(`Error updating android_device for ${simLabel}:`, updateError)
        } else {
          androidDevices.push(updated)
          console.log(`Updated android_device for ${simLabel}:`, updated)
        }
        return
      }

      // Check if there's an existing entry with same device_name and sim_number but DIFFERENT device_id
      // This handles the case where device was manually added and now the real device is registering
      const { data: existingByName } = await supabase
        .from('android_devices')
        .select('*')
        .eq('device_name', deviceName)
        .eq('sim_number', simNumber)
        .maybeSingle()

      if (existingByName && existingByName.device_id !== deviceId) {
        console.log(`Found existing device by name, updating device_id from ${existingByName.device_id} to ${deviceId}`)
        
        // Update the device_id to match the real Android device
        const { data: updated, error: updateError } = await supabase
          .from('android_devices')
          .update({
            device_id: deviceId, // Sync to real device_id
            device_name: deviceName,
            provider_name: provider,
            last_ping_at: new Date().toISOString(),
            is_active: true,
            archived_at: null
          })
          .eq('id', existingByName.id)
          .select()
          .single()

        if (updateError) {
          console.error(`Error syncing android_device for ${simLabel}:`, updateError)
        } else {
          androidDevices.push(updated)
          console.log(`Synced android_device device_id for ${simLabel}:`, updated)
        }
        return
      }

      // No existing record, insert new
      const { data: newDevice, error: insertError } = await supabase
        .from('android_devices')
        .insert({
          device_id: deviceId,
          device_name: deviceName,
          sim_number: simNumber,
          provider_name: provider,
          last_ping_at: new Date().toISOString(),
          is_active: true
        })
        .select()
        .single()

      if (insertError) {
        console.error(`Error inserting android_device for ${simLabel}:`, insertError)
      } else {
        androidDevices.push(newDevice)
        console.log(`Created android_device for ${simLabel}:`, newDevice)
        
        // Auto-create default sim_balances records for the new device
        const { error: balanceError } = await supabase
          .from('sim_balances')
          .insert([
            { sim_id: newDevice.id, balance: 0, balance_type: 'evc_plus', balance_source: 'manual' },
            { sim_id: newDevice.id, balance: 0, balance_type: 'evoucher', balance_source: 'manual' }
          ])
        
        if (balanceError) {
          console.error(`Error creating sim_balances for ${simLabel}:`, balanceError)
        } else {
          console.log(`✅ Created default sim_balances for ${simLabel}`)
        }
      }
    }

    // Process SIM 1
    if (sim1Number) {
      await processSim(sim1Number, 'SIM1')
    }

    // Process SIM 2
    if (sim2Number) {
      await processSim(sim2Number, 'SIM2')
    }

    return new Response(
      JSON.stringify({
        success: true,
        device: device,
        androidDevices: androidDevices,
        message: existingDevice ? 'Device updated successfully' : 'Device registered successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: any) {
    console.error('Error in device registration:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})