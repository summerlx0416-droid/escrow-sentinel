
Add-Type -AssemblyName System.Speech
$jobs = Get-Content -Raw -Encoding UTF8 'C:\Users\Administrator\Desktop\xuabsgabf\bounty-workbench\workstreams\hackathon-gibwork\docs\demo\tts\jobs.json'
foreach ($j in ($jobs | ConvertFrom-Json)) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice('Microsoft Zira Desktop')
  $s.Rate = [int]$j.rate
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $s.SetOutputToWaveFile($j.wav, $fmt)
  $s.Speak($j.text)
  $s.Dispose()
}
Write-Output 'TTS_DONE'
