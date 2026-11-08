param([ValidateSet('choose','save','unlock','grant','notice')][string]$Mode)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
function Reply($value){[Console]::Out.Write(($value|ConvertTo-Json -Compress -Depth 8))}
try {
  $data=[Console]::In.ReadToEnd()|ConvertFrom-Json
  $form=New-Object System.Windows.Forms.Form
  $form.Text='Certosa · Archivio locale'
  $form.Width=580;$form.Height=440;$form.StartPosition='CenterScreen';$form.TopMost=$true
  $form.ShowInTaskbar=$true
  $form.Add_Shown({$form.Activate();$form.BringToFront()})
  $form.Font=[System.Drawing.Font]::new('Segoe UI',10)
  if($Mode -eq 'notice'){
    [void][System.Windows.Forms.MessageBox]::Show($form,[string]$data.message,'Certosa · Archivio locale',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information)
    Reply @{acknowledged=$true};$form.Dispose();exit
  }
  if($Mode -eq 'choose' -or $Mode -eq 'save'){
    $picker=if($Mode -eq 'save'){New-Object System.Windows.Forms.SaveFileDialog}else{New-Object System.Windows.Forms.OpenFileDialog}
    $picker.Title=if($data.incrementalCopy){"Copia cifrata dell'archivio incrementale"}elseif($Mode -eq 'save'){'Esporta una copia .certosa compatibile'}elseif($data.importing){'Importa .certosa in una copia incrementale'}else{'Apri un archivio Certosa per la chat'}
    $picker.Filter=if($data.incrementalCopy){'Archivi incrementali (*.certosa-db)|*.certosa-db'}elseif($data.incrementalAllowed){'Archivi Certosa (*.certosa;*.certosa-db)|*.certosa;*.certosa-db'}else{'Archivi Certosa (*.certosa)|*.certosa'}
    $picker.InitialDirectory=[string]$data.directory
    if($Mode -eq 'save'){$ext=if($data.incrementalCopy){'.certosa-db'}else{'.certosa'};$picker.FileName='Copia-'+[guid]::NewGuid().ToString().Substring(0,8)+$ext;$picker.OverwritePrompt=$true}else{$picker.CheckFileExists=$true;$picker.Multiselect=$false}
    $form.Height=170
    $intro=New-Object System.Windows.Forms.Label
    $intro.Text='Scegli il file .certosa. Password e autorizzazione saranno richieste qui, sul dispositivo.'
    if($data.incrementalCopy){$intro.Text="Copia completa cifrata. Mantiene la password dell'archivio; l'originale non viene modificato."}
    $intro.SetBounds(20,20,520,80);$form.Controls.Add($intro)
    $form.Show();$form.Activate()
    if($picker.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK){Reply @{path=$picker.FileName}}else{Reply @{cancelled=$true}}
    $picker.Dispose();$form.Dispose();exit
  }
  $label=New-Object System.Windows.Forms.Label
  $label.SetBounds(20,18,525,105);$label.AutoSize=$false
  $form.Controls.Add($label)
  $ok=New-Object System.Windows.Forms.Button
  $ok.SetBounds(195,345,235,36);$ok.DialogResult=[System.Windows.Forms.DialogResult]::OK
  $cancel=New-Object System.Windows.Forms.Button
  $cancel.Text='Annulla';$cancel.SetBounds(435,345,105,36);$cancel.DialogResult=[System.Windows.Forms.DialogResult]::Cancel
  $form.Controls.AddRange(@($ok,$cancel));$form.AcceptButton=$ok;$form.CancelButton=$cancel
  if($Mode -eq 'unlock'){
    $form.Height=570;$label.Height=205;$ok.Top=475;$cancel.Top=475
    $label.Text=if($data.encrypted){"Sblocca $($data.name).`r`nLa password viene usata soltanto sul dispositivo. Non viene inviata alla chat."}else{"$($data.name) non e protetto.`r`nScegli una password per cifrare i prossimi salvataggi nel formato Certosa attuale."}
    if($data.exporting){$label.Text="Scegli la password della copia .certosa esportata.`r`nLa password resta sul dispositivo. Il file completo non viene mostrato alla chat."}
    if($data.creating){$label.Text="Crea $($data.name).`r`nScegli una password di almeno 8 caratteri e ripetila. Servira a ogni apertura della biblioteca.`r`nLa password resta sul dispositivo e non viene inviata alla chat."}
    if($data.importing){$label.Text+="`r`nCreo una copia incrementale .certosa-db, con questa password. L'originale non viene modificato."}
    if($data.copyTo){$label.Text+="`r`nCopia di lavoro cifrata in $($data.copyTo). L'originale resta al suo posto."}
    if($data.retry){$label.Text+="`r`nSblocco non riuscito: controlla la password e riprova."}
    $box=New-Object System.Windows.Forms.TextBox
    $box.SetBounds(20,245,520,30);$box.UseSystemPasswordChar=$true
    $form.Controls.Add($box)
    $repeat=New-Object System.Windows.Forms.TextBox
    $repeat.SetBounds(20,325,520,30);$repeat.UseSystemPasswordChar=$true
    if(-not $data.encrypted){
      $hint=New-Object System.Windows.Forms.Label;$hint.Text='Ripeti la password';$hint.SetBounds(20,295,520,25)
      $form.Controls.AddRange(@($hint,$repeat))
    }
    $ok.Text=if($data.creating){'Crea biblioteca cifrata'}else{'Sblocca in locale'};$ok.Enabled=$false
    $validate={ $minimum=if($data.creating){8}else{1};$ok.Enabled=$box.Text.Length -ge $minimum -and ($data.encrypted -or $box.Text -ceq $repeat.Text) }
    $box.Add_TextChanged($validate);$repeat.Add_TextChanged($validate)
    $form.Add_Shown({$box.Focus()})
    if($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){Reply @{password=$box.Text}}else{Reply @{cancelled=$true}}
    $box.Clear();$repeat.Clear();$form.Dispose();exit
  }
  $label.Text="Scegli i quaderni accessibili alla chat. Il consenso scade dopo 30 minuti di inattivita; ogni utilizzo riuscito rinnova l’attesa. Puoi revocarlo quando vuoi.`r`nGli estratti scelti passano alla chat e possono arrivare al suo fornitore. Certosa non controlla invii e conservazione di questi servizi.`r`nPer tenere i dati sul dispositivo usa una chat e un modello locali verificati offline.`r`nEscludi quaderni con password o altri segreti; quelli classificati riservati sono gia esclusi."
  $label.Height=190
  $all=New-Object System.Windows.Forms.CheckBox
  $all.Text='Seleziona tutti i quaderni disponibili';$all.SetBounds(20,210,520,28)
  $list=New-Object System.Windows.Forms.CheckedListBox
  $list.SetBounds(20,243,520,130);$list.CheckOnClick=$true
  foreach($notebook in $data.notebooks){$entry=$notebook.title+' · '+$notebook.volume;if($notebook.author){$entry+=' — '+$notebook.author};[void]$list.Items.Add($entry,$false)}
  $all.Add_CheckedChanged({for($i=0;$i -lt $list.Items.Count;$i++){$list.SetItemChecked($i,$all.Checked)}})
  $write=New-Object System.Windows.Forms.CheckBox
  $write.Text='Consenti anche le modifiche con copia di recupero cifrata';$write.SetBounds(20,380,520,30);$write.Checked=$true
  $form.Height=560;$ok.Top=465;$cancel.Top=465
  $create=New-Object System.Windows.Forms.CheckBox
  $create.Text='Consenti anche la creazione di nuovi quaderni';$create.SetBounds(20,415,520,30);$create.Checked=$false
  $ok.Text='Autorizza · 30 min inattivi';$ok.Enabled=$false
  $list.Add_ItemCheck({param($sender,$eventArgs) $count=$list.CheckedItems.Count;if($eventArgs.NewValue -eq [System.Windows.Forms.CheckState]::Checked){$count++}else{$count--};$ok.Enabled=$count -gt 0 -or ($write.Checked -and $create.Checked)})
  $refreshGrant={$create.Enabled=$write.Checked;$ok.Enabled=$list.CheckedItems.Count -gt 0 -or ($write.Checked -and $create.Checked)}
  $create.Add_CheckedChanged($refreshGrant);$write.Add_CheckedChanged($refreshGrant)
  $form.Controls.AddRange(@($all,$list,$write,$create))
  if($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){
    $ids=@();foreach($index in $list.CheckedIndices){$ids+=$data.notebooks[$index].id}
    Reply @{notebookIds=@($ids);write=$write.Checked;allowCreate=($write.Checked -and $create.Checked)}
  }else{Reply @{cancelled=$true}}
  $form.Dispose()
} catch { Reply @{error='LOCAL_DIALOG_UNAVAILABLE'};exit 1 }
