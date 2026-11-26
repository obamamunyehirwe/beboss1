package com.beboss.shopmgmt.util

internal object LocalizationScreens {
    val entries: Map<String, Map<AppLanguage, String>> = mapOf(
        // =====================================================================
        // SPLASH, NAVIGATION & AUTH EXTRA
        // =====================================================================
        "splash_tagline" to locEntry(
            "Multi-Branch POS & Inventory Suite",
            "POS y'Amashami Menshi & Ububiko",
            "Suite POS Multi-Agences & Stock",
            "Mfumo wa POS ya Matawi na Stoo"
        ),
        "splash_badge" to locEntry(
            "BEBOSS ENTERPRISE POS",
            "BEBOSS ENTERPRISE POS",
            "BEBOSS POS ENTREPRISE",
            "BEBOSS ENTERPRISE POS"
        ),
        "splash_emblem_cd" to locEntry(
            "BeBoss POS Emblem",
            "Ikirango cya BeBoss POS",
            "Emblème BeBoss POS",
            "Nembo ya BeBoss POS"
        ),
        "default_store_name" to locEntry(
            "BeBoss Store",
            "Ububiko bwa BeBoss",
            "Boutique BeBoss",
            "Duka la BeBoss"
        ),
        "nav_quick_actions_pos" to locEntry(
            "POS",
            "POS",
            "POS",
            "POS"
        ),
        "nav_toggle_theme" to locEntry(
            "Toggle Theme",
            "Hindura Isura",
            "Changer le thème",
            "Badili Mandhari"
        ),
        "nav_quick_pos_actions" to locEntry(
            "Quick POS Actions",
            "Ibikorwa byihuse bya POS",
            "Actions Rapides POS",
            "Vitendo vya Haraka vya POS"
        ),
        "auth_join_owner_placeholder" to locEntry(
            "Owner @username (e.g. jeanpaul)",
            "Username ya nyir'iduka (urugero: jeanpaul)",
            "Identifiant propriétaire (ex. jeanpaul)",
            "Jina la mmiliki (mf. jeanpaul)"
        ),
        "auth_this_device_name_label" to locEntry(
            "This Device Name *",
            "Izina ry'iyi Telefoni *",
            "Nom de cet appareil *",
            "Jina la Kifaa Hiki *"
        ),
        "auth_this_device_name_placeholder" to locEntry(
            "Cashier Counter 2",
            "Kontwari y'Umucuruzi 2",
            "Caisse Comptoir 2",
            "Kaunta ya Keshia 2"
        ),
        "auth_err_join_code" to locEntry(
            "Enter the Device Join Code from the Shop Owner.",
            "Injiza kode yo kwinjira wahawe na nyir'iduka.",
            "Entrez le code d'appairage fourni par le propriétaire.",
            "Weka msimbo wa kujiunga kutoka kwa mmiliki wa duka."
        ),
        "auth_err_device_name" to locEntry(
            "Enter a name for this device.",
            "Injiza izina ry'iyi telefoni.",
            "Entrez un nom pour cet appareil.",
            "Weka jina la kifaa hiki."
        ),
        "auth_pair_device_cta" to locEntry(
            "Pair Device & Sync Shop",
            "Huza Telefoni & Amakuru y'Iduka",
            "Appairer & Synchroniser",
            "Unganisha Kifaa & Sawazisha"
        ),
        "join_otp_title" to locEntry(
            "Verify Owner Phone (SMS Code)",
            "Emeza Terefone ya Nyir'ububiko (Kode SMS)",
            "Vérifier le téléphone du propriétaire (code SMS)",
            "Thibitisha Simu ya Mmiliki (Msimbo SMS)"
        ),
        "join_otp_hint" to locEntry(
            "We automatically send a one-time code to the registered owner phone when you pair this device.",
            "Tuzihweza kode ihise kuri terefone ya nyir'ububiko iyo uhize iyi telefoni.",
            "Nous envoyons automatiquement un code unique au téléphone du propriétaire lors de l'appairage.",
            "Tunatuma msimbo wa muda kwa simu ya mmiliki unapounganisha kifaa hiki."
        ),
        "join_otp_sending" to locEntry(
            "Sending the owner verification code…",
            "Tuzihweza kode yo kemeza…",
            "Envoi du code de vérification…",
            "Inatuma msimbo wa uthibitisho…"
        ),
        "join_otp_sent" to locEntry(
            "A verification code was sent by SMS to the registered owner phone.",
            "Kode yo kemeza yoherejwe kuri terefone ya nyir'ububiko.",
            "Un code de vérification a été envoyé par SMS au téléphone du propriétaire.",
            "Msimbo wa uthibitisho umetumwa kwa SMS kwa simu ya mmiliki."
        ),
        "join_otp_failed" to locEntry(
            "The verification code could not be sent. Check the owner phone and try again.",
            "Kode yo kemeza itashoboye koherezwa. Reba terefone ya nyir'ububiko hanyuma wongere ugerageze.",
            "Le code n'a pas pu être envoyé. Vérifiez le téléphone du propriétaire et réessayez.",
            "Msimbo hauweza kutumwa. Angalia simu ya mmiliki kisha ujaribu tena."
        ),
        "join_otp_verifying" to locEntry(
            "Verifying the owner code…",
            "Tuzigenzura kode ya nyir'ububiko…",
            "Vérification du code propriétaire…",
            "Inathibitisha msimbo wa mmiliki…"
        ),
        "join_otp_verified" to locEntry(
            "Owner phone verified. Pairing this terminal…",
            "Terefone ya nyir'ububiko yemejwe. Tuzihuza iyi telefoni…",
            "Téléphone du propriétaire vérifié. Appairage en cours…",
            "Simu ya mmiliki imethibitishwa. Inaunganisha kifaa hiki…"
        ),
        "join_otp_invalid" to locEntry(
            "Enter the valid 6–8 digit code sent to the owner phone.",
            "Injiza kode y'ukuri y'imibare 6–8 yoherejwe kuri terefone ya nyir'ububiko.",
            "Saisissez le code valide à 6–8 chiffres envoyé au téléphone du propriétaire.",
            "Weka msimbo sahihi wa tarakimu 6–8 uliotumwa kwa simu ya mmiliki."
        ),
        "join_otp_label" to locEntry(
            "SMS verification code *",
            "Kode yo kemeza kuri SMS *",
            "Code de vérification SMS *",
            "Msimbo wa uthibitisho SMS *"
        ),
        "join_otp_placeholder" to locEntry(
            "6–8 digits",
            "Imibare 6–8",
            "6–8 chiffres",
            "Tarakimu 6–8"
        ),
        "join_otp_send" to locEntry(
            "Send Owner Code",
            "Ohereza Kode ya Nyir'ububiko",
            "Envoyer le code propriétaire",
            "Tuma Msimbo wa Mmiliki"
        ),
        "join_otp_resend" to locEntry(
            "Resend Code",
            "Ohereza Kode Ukundi",
            "Renvoyer le code",
            "Tuma Msimbo Tena"
        ),
        "join_otp_verify" to locEntry(
            "Verify & Pair",
            "Emeza & Huza",
            "Vérifier & Appairer",
            "Thibitisha & Unganisha"
        ),
        "auth_cloud_autosave_note" to locEntry(
            "Saves automatically to Supabase Cloud & syncs in background whenever internet connects.",
            "Bibikwa byikora kuri Cloud kandi bigahuzwa igihe cyose interineti ibonetse.",
            "Enregistrement auto sur le Cloud Supabase et synchronisation dès qu'Internet est disponible.",
            "Huhifadhi kiotomatiki kwenye Wingu na kusawazisha intaneti inapopatikana."
        ),
        "auth_backspace_cd" to locEntry(
            "Backspace",
            "Siba inyuma",
            "Effacer",
            "Futa"
        ),
        "auth_biometric_cd" to locEntry(
            "Biometric Unlock",
            "Gufungura n'Igikumwe",
            "Déverrouillage biométrique",
            "Fungua kwa Alama ya Kidole"
        ),

        // =====================================================================
        // DASHBOARD SCREEN
        // =====================================================================
        "dash_all_branches_fmt" to locEntry(
            "All Branches (%d)",
            "Amashami Yose (%d)",
            "Toutes les agences (%d)",
            "Matawi Yote (%d)"
        ),
        "dash_hq_branch" to locEntry(
            "HQ Branch",
            "Ishami Rikuru",
            "Siège Principal",
            "Tawi Kuu"
        ),
        "dash_syncing" to locEntry(
            "Syncing...",
            "Kuhuza...",
            "Synchro...",
            "Inasawazisha..."
        ),
        "dash_synced" to locEntry(
            "Synced",
            "Byahujwe",
            "Synchronisé",
            "Imesawazishwa"
        ),
        "dash_auto_sync" to locEntry(
            "Auto-Sync",
            "Guhuza Byikora",
            "Sync Auto",
            "Usawazishaji Auto"
        ),
        "dash_offline" to locEntry(
            "Offline",
            "Nta Interineti",
            "Hors ligne",
            "Nje ya Mtandao"
        ),
        "dash_locked" to locEntry(
            "Locked",
            "Birafunze",
            "Verrouillé",
            "Imefungwa"
        ),
        "dash_trial_days_fmt" to locEntry(
            "Trial %dd",
            "Igerageza %dd",
            "Essai %dj",
            "Jaribio Siku %d"
        ),
        "dash_days_short_fmt" to locEntry(
            "%dd",
            "Iminsi %d",
            "%dj",
            "Siku %d"
        ),
        "dash_switch_branch_cd" to locEntry(
            "Switch branch",
            "Hindura ishami",
            "Changer d'agence",
            "Badili tawi"
        ),
        "dash_sync_status_cd" to locEntry(
            "Sync status",
            "Imimerere yo guhuza",
            "État de synchronisation",
            "Hali ya usawazishaji"
        ),
        "dash_license_status_cd" to locEntry(
            "License status",
            "Imimerere y'ifatabuguzi",
            "État de la licence",
            "Hali ya leseni"
        ),
        "dash_trial_banner_title" to locEntry(
            "4-Day Free Trial Active",
            "Iminsi 4 y'Ubuntu Irakora",
            "Essai Gratuit de 4 Jours Actif",
            "Majaribio ya Bure ya Siku 4 Yamewashwa"
        ),
        "dash_trial_banner_desc_fmt" to locEntry(
            "%d days left. Pay 5,000 FRw/mo via MoMo or request your Admin Unlock Code anytime in Settings.",
            "Hasigaye iminsi %d gusa. Ishyura 5,000 FRw/ukwezi na MoMo cyangwa usabe kode yo gufungura muri Igenamiterere.",
            "%d jours restants. Payez 5 000 FRw/mois via MoMo ou demandez votre code Admin dans Paramètres.",
            "Siku %d zimebaki. Lipa 5,000 FRw/mwezi kwa MoMo au omba msimbo wa Admin katika Mipangilio."
        ),
        "dash_min_fmt" to locEntry(
            "Min: %s",
            "Byibuze: %s",
            "Min : %s",
            "Kima cha chini: %s"
        ),

        // =====================================================================
        // POS CHECKOUT SCREEN
        // =====================================================================
        "pos_empty_catalog" to locEntry(
            "No products matching search. Add inventory first.",
            "Nta bicuruzwa bibonetse. Ongeramo ibicuruzwa mu bubiko.",
            "Aucun produit trouvé. Ajoutez d'abord du stock.",
            "Hakuna bidhaa zilizopatikana. Ongeza stoo kwanza."
        ),
        "pos_add_products_cta" to locEntry(
            "Add Products",
            "Ongeramo Ibicuruzwa",
            "Ajouter Produits",
            "Ongeza Bidhaa"
        ),
        "pos_out_of_stock_badge" to locEntry(
            "OUT",
            "BYASHIZE",
            "ÉPUISÉ",
            "IMEISHA"
        ),
        "pos_stock_qty_fmt" to locEntry(
            "%s %s",
            "%s %s",
            "%s %s",
            "%s %s"
        ),
        "pos_customer_field" to locEntry(
            "Customer",
            "Umukiriya",
            "Client",
            "Mteja"
        ),
        "pos_walkin_option" to locEntry(
            "Walk-in Customer (Cash)",
            "Umuguzi Usanzwe (Cash)",
            "Client de passage (Espèces)",
            "Mteja wa Kawaida (Taslimu)"
        ),
        "pos_debt_badge_fmt" to locEntry(
            "Debt: %s",
            "Umwenda: %s",
            "Dette : %s",
            "Deni: %s"
        ),
        "pos_discount_label_fmt" to locEntry(
            "Discount (%s)",
            "Kugabanyiriza (%s)",
            "Remise (%s)",
            "Punguzo (%s)"
        ),
        "pos_cash_amount_fmt" to locEntry(
            "Cash Amount (%s)",
            "Amafaranga ya Cash (%s)",
            "Montant Espèces (%s)",
            "Kiasi cha Taslimu (%s)"
        ),
        "pos_momo_amount_fmt" to locEntry(
            "MTN MoMo (%s)",
            "MTN MoMo (%s)",
            "MTN MoMo (%s)",
            "MTN MoMo (%s)"
        ),
        "pos_split_total_hint_fmt" to locEntry(
            "Split Total: %s / %s %s",
            "Igiteranyo cyavanzwe: %s / %s %s",
            "Total mixte : %s / %s %s",
            "Jumla Mchanganyiko: %s / %s %s"
        ),
        "pos_amount_paid_hint_fmt" to locEntry(
            "Amount Paid (Default Full: %s %s)",
            "Ayishyuwe (Yose hamwe: %s %s)",
            "Montant payé (Total : %s %s)",
            "Kiasi Kilicholipwa (Jumla: %s %s)"
        ),
        "pos_notes_label" to locEntry(
            "Receipt Note / Reference (Optional)",
            "Icyitonderwa ku nyemezabuguzi (Si ngombwa)",
            "Note de reçu / Référence (Optionnel)",
            "Maelezo ya Risiti / Kumbukumbu (Hiari)"
        ),
        "pos_balance_due_label" to locEntry(
            "Balance Due (Credit):",
            "Umwenda Usigaye:",
            "Solde restant (Crédit) :",
            "Deni Linalobaki:"
        ),
        "pos_held_carts_btn_fmt" to locEntry(
            "Held (%d)",
            "Bibitse (%d)",
            "Attente (%d)",
            "Zilizoshikiliwa (%d)"
        ),
        "pos_default_hold_label" to locEntry(
            "Customer Waiting",
            "Umukiriya Utegereje",
            "Client en attente",
            "Mteja Anayesubiri"
        ),
        "pos_hold_btn" to locEntry(
            "Hold",
            "Bika",
            "Attente",
            "Shikilia"
        ),
        "pos_no_held_carts" to locEntry(
            "No held carts right now.",
            "Nta gitebo kibitse gihari.",
            "Aucun panier en attente.",
            "Hakuna vikapu vilivyoshikiliwa."
        ),
        "pos_held_cart_meta_fmt" to locEntry(
            "%d items • %s",
            "ibicuruzwa %d • %s",
            "%d articles • %s",
            "bidhaa %d • %s"
        ),
        "pos_barcode_dialog_title" to locEntry(
            "Barcode / Quick SKU",
            "Barcode / Kode y'Igicuruzwa",
            "Code-barres / SKU Rapide",
            "Barcode / SKU ya Haraka"
        ),
        "pos_barcode_dialog_hint" to locEntry(
            "Enter or scan barcode or product name:",
            "Injiza cyangwa usome barcode cyangwa izina:",
            "Saisissez ou scannez le code-barres ou le nom :",
            "Weka au skani barcode au jina la bidhaa:"
        ),
        "pos_barcode_input_label" to locEntry(
            "Barcode / SKU",
            "Barcode / SKU",
            "Code-barres / SKU",
            "Barcode / SKU"
        ),
        "pos_camera_scan_btn" to locEntry(
            "Scan with Camera",
            "Soma na Kamera",
            "Scanner par caméra",
            "Skani kwa Kamera"
        ),
        "pos_found_add" to locEntry(
            "Found! Add to Cart",
            "Byabonetse! Shyira mu gitebo",
            "Trouvé ! Ajouter au panier",
            "Imepatikana! Weka Kikapuni"
        ),
        "pos_barcode_not_found" to locEntry(
            "No product matched. Try typing exact name or barcode.",
            "Nta gicuruzwa gihuye na yo. Gerageza izina cyangwa kode y'ukuri.",
            "Aucun produit correspondant. Essayez le nom ou code exact.",
            "Hakuna bidhaa iliyolingana. Jaribu jina au msimbo sahihi."
        ),
        "pos_add_item_cd" to locEntry(
            "Increase quantity",
            "Ongera ingano",
            "Augmenter la quantité",
            "Ongeza idadi"
        ),
        "pos_remove_item_cd" to locEntry(
            "Decrease quantity",
            "Gabanya ingano",
            "Diminuer la quantité",
            "Punguza idadi"
        ),
        "pos_delete_item_cd" to locEntry(
            "Remove from cart",
            "Kura mu gitebo",
            "Retirer du panier",
            "Ondoa kikapuni"
        ),

        // =====================================================================
        // INVENTORY & PURCHASES LEDGER
        // =====================================================================
        "inv_tab_stock" to locEntry(
            "Stock Sheet",
            "Ububiko",
            "Fiches de Stock",
            "Orodha ya Stoo"
        ),
        "inv_tab_purchases" to locEntry(
            "Purchases & Inflow",
            "Ibyaguzwe & Kwinjira",
            "Achats & Réappros",
            "Manunuzi & Mapokezi"
        ),
        "inv_search_placeholder" to locEntry(
            "Search product name, SKU or category...",
            "Shakisha izina, kode cyangwa icyiciro...",
            "Chercher nom, SKU ou catégorie...",
            "Tafuta jina la bidhaa, SKU au kategoria..."
        ),
        "inv_add_btn" to locEntry(
            "Add",
            "Ongeramo",
            "Ajouter",
            "Ongeza"
        ),
        "inv_export_csv_btn" to locEntry(
            "CSV",
            "CSV",
            "CSV",
            "CSV"
        ),
        "inv_export_pdf_btn" to locEntry(
            "PDF",
            "PDF",
            "PDF",
            "PDF"
        ),
        "inv_clear_all_btn" to locEntry(
            "Clear All",
            "Siba Byose",
            "Tout Effacer",
            "Futa Zote"
        ),
        "inv_csv_exported_toast" to locEntry(
            "Excel CSV exported successfully!",
            "Imbonerahamwe ya CSV yasohotse neza!",
            "CSV Excel exporté avec succès !",
            "CSV ya Excel imehamishwa!"
        ),
        "inv_clear_title" to locEntry(
            "Delete All Products?",
            "Usiba Ibicuruzwa Byose?",
            "Supprimer tous les produits ?",
            "Futa Bidhaa Zote?"
        ),
        "inv_clear_msg" to locEntry(
            "All products in the inventory catalog will be permanently deleted. This cannot be undone.",
            "Ibicuruzwa byose mu bubiko bizasibwa burundu. Ntibishobora kugarurwa.",
            "Tous les produits du catalogue seront supprimés définitivement. Action irréversible.",
            "Bidhaa zote kwenye orodha zitafutwa kabisa. Hatua hii haiwezi kutenduliwa."
        ),
        "inv_confirm_clear" to locEntry(
            "Yes, Clear Catalog",
            "Yego, Siba Byose",
            "Oui, Tout Supprimer",
            "Ndiyo, Futa Zote"
        ),
        "inv_col_buy" to locEntry(
            "Buy Price",
            "Ikiguzi",
            "Prix Achat",
            "Bei Nunua"
        ),
        "inv_col_sell" to locEntry(
            "Sell Price",
            "Ugurisha",
            "Prix Vente",
            "Bei Uza"
        ),
        "inv_col_margin" to locEntry(
            "Margin",
            "Inyungu",
            "Marge",
            "Faida"
        ),
        "inv_empty_title" to locEntry(
            "No products in inventory",
            "Nta bicuruzwa biri mu bubiko",
            "Aucun produit en stock",
            "Hakuna bidhaa stooni"
        ),
        "inv_empty_hint" to locEntry(
            "Tap '+ Add Product' to build your catalog",
            "Kanda '+ Ongeramo' utangire kwandika ibicuruzwa",
            "Appuyez sur « Nouveau Produit » pour créer votre catalogue",
            "Gusa '+ Ongeza Bidhaa' kuanza orodha yako"
        ),
        "inv_edit_product" to locEntry(
            "Edit Product",
            "Hindura Igicuruzwa",
            "Modifier le Produit",
            "Hariri Bidhaa"
        ),
        "inv_sku_barcode_hint" to locEntry(
            "SKU / Barcode",
            "Kode / Barcode",
            "SKU / Code-barres",
            "SKU / Barcode"
        ),
        "inv_unit_label" to locEntry(
            "Unit",
            "Igipimo",
            "Unité",
            "Kipimo"
        ),
        "inv_min_alert_label" to locEntry(
            "Min Alert",
            "Iburira",
            "Seuil Alerte",
            "Tahadhari"
        ),
        "inv_update_btn" to locEntry(
            "Update",
            "Vugurura",
            "Mettre à jour",
            "Sasisha"
        ),
        "inv_save_btn" to locEntry(
            "Save",
            "Bika",
            "Enregistrer",
            "Hifadhi"
        ),
        "inv_adjust_title_fmt" to locEntry(
            "Adjust: %s",
            "Hindura: %s",
            "Ajuster : %s",
            "Rekebisha: %s"
        ),
        "inv_current_stock_fmt" to locEntry(
            "Current Stock: %s %s",
            "Ibisigaye: %s %s",
            "Stock actuel : %s %s",
            "Stoo ya Sasa: %s %s"
        ),
        "inv_qty_change_label" to locEntry(
            "Quantity Change (e.g. 10 or -2)",
            "Impinduka y'Ingano (urugero: 10 cyangwa -2)",
            "Variation de quantité (ex. 10 ou -2)",
            "Mabadiliko ya Kiasi (mf. 10 au -2)"
        ),
        "inv_reason_optional" to locEntry(
            "Reason (Optional)",
            "Impamvu (Si ngombwa)",
            "Motif (Optionnel)",
            "Sababu (Hiari)"
        ),
        "inv_delete_product_cd" to locEntry(
            "Delete Product",
            "Siba Igicuruzwa",
            "Supprimer le produit",
            "Futa Bidhaa"
        ),
        "pur_orders_count_label" to locEntry(
            "Purchase Orders",
            "Ibyatumijwe",
            "Bons d'achat",
            "Oda za Manunuzi"
        ),
        "pur_total_spend_label" to locEntry(
            "Total Inflow Spend",
            "Ayishyuwe Yose",
            "Dépenses d'achat",
            "Jumla ya Manunuzi"
        ),
        "pur_export_csv_btn" to locEntry(
            "Export CSV",
            "Sohora CSV",
            "Exporter CSV",
            "Hamisha CSV"
        ),
        "pur_new_purchase_btn" to locEntry(
            "+ New Purchase / Restock",
            "+ Gura / Ongera Ububiko",
            "+ Nouvel Achat / Réappro",
            "+ Manunuzi Mapya / Jaza Stoo"
        ),
        "pur_csv_exported_toast" to locEntry(
            "Purchases ledger CSV exported!",
            "Igitabo cy'ibyaguzwe cya CSV cyasohotse!",
            "Journal des achats CSV exporté !",
            "Daftari la manunuzi la CSV limehamishwa!"
        ),
        "pur_col_num" to locEntry("#", "#", "#", "#"),
        "pur_col_product" to locEntry("Product", "Igicuruzwa", "Produit", "Bidhaa"),
        "pur_col_supplier" to locEntry("Supplier", "Uwabigemuye", "Fournisseur", "Msambazaji"),
        "pur_col_qty" to locEntry("Qty", "Ingano", "Qté", "Idadi"),
        "pur_col_unit_cost" to locEntry("Unit Cost", "Ikiguzi/1", "Coût Unit.", "Bei/1"),
        "pur_col_total_cost" to locEntry("Total Cost", "Igiteranyo", "Coût Total", "Jumla"),
        "pur_col_status" to locEntry("Status", "Imimerere", "Statut", "Hali"),
        "pur_col_action" to locEntry("Action", "Igikorwa", "Action", "Kitendo"),
        "pur_empty_hint" to locEntry(
            "No purchases recorded yet. Tap '+ New Purchase' to restock suppliers!",
            "Nta byaguzwe birandikwa. Kanda '+ Gura' wandike ibicuruzwa bishya!",
            "Aucun achat enregistré. Appuyez sur « + Nouvel Achat » pour réapprovisionner !",
            "Hakuna manunuzi bado. Gusa '+ Manunuzi Mapya' kujaza stoo!"
        ),
        "pur_direct_restock_supplier" to locEntry(
            "Direct Restock",
            "Kongera Ububiko",
            "Réappro Direct",
            "Ujazaji wa Moja kwa Moja"
        ),
        "pur_delete_record_title" to locEntry(
            "Delete Purchase Record?",
            "Usiba Icyaguzwe?",
            "Supprimer cet achat ?",
            "Futa Rekodi ya Manunuzi?"
        ),
        "pur_delete_record_msg_fmt" to locEntry(
            "Remove %s (%s units) from purchase ledger?",
            "Ushaka gukura %s (%s) mu gitabo cy'ibyaguzwe?",
            "Retirer %s (%s unités) du journal des achats ?",
            "Ondoa %s (%s) kutoka daftari la manunuzi?"
        ),
        "pur_dialog_title" to locEntry(
            "Record Supplier Purchase",
            "Andika Ibyaguzwe mu Bubiko",
            "Enregistrer un Achat Fournisseur",
            "Rekodi Manunuzi ya Msambazaji"
        ),
        "pur_dialog_no_products" to locEntry(
            "Please add a product in Stock Sheet first before recording a supplier purchase.",
            "Banza wandike igicuruzwa mu Bubiko mbere yo kwandika icyaguzwe.",
            "Veuillez d'abord ajouter un produit dans les Fiches de Stock.",
            "Tafadhali ongeza bidhaa stooni kwanza kabla ya kurekodi manunuzi."
        ),
        "pur_select_product_label" to locEntry(
            "Select Product *",
            "Hitamo Igicuruzwa *",
            "Sélectionner le produit *",
            "Chagua Bidhaa *"
        ),
        "pur_qty_received_label" to locEntry(
            "Quantity Received *",
            "Ingano Yakiriwe *",
            "Quantité reçue *",
            "Idadi Iliyopokelewa *"
        ),
        "pur_unit_cost_label" to locEntry(
            "Unit Cost Price *",
            "Igiciro Wakiguze *",
            "Coût unitaire d'achat *",
            "Gharama kwa Kipimo *"
        ),
        "pur_new_sell_optional" to locEntry(
            "New Sell Price (Opt.)",
            "Igiciro Gishya (Si ngombwa)",
            "Nouveau prix de vente (Opt.)",
            "Bei Mpya ya Kuuza (Hiari)"
        ),
        "pur_supplier_name_label" to locEntry(
            "Supplier / Wholesaler Name",
            "Izina ry'Uwabigemuye",
            "Nom du fournisseur / grossiste",
            "Jina la Msambazaji / Muuzaji Jumla"
        ),
        "pur_supplier_phone_label" to locEntry(
            "Supplier Phone",
            "Terefone y'Uwabigemuye",
            "Téléphone fournisseur",
            "Simu ya Msambazaji"
        ),
        "pur_invoice_ref_label" to locEntry(
            "Supplier Invoice Ref #",
            "Nimero y'Inyemezabuguzi #",
            "Réf. Facture Fournisseur #",
            "Namba ya Ankara ya Msambazaji #"
        ),
        "pur_payment_status_label" to locEntry(
            "Payment Status:",
            "Imimerere y'Ubwishyu:",
            "Statut du paiement :",
            "Hali ya Malipo:"
        ),
        "pur_status_paid" to locEntry("PAID", "YISHYUWE", "PAYÉ", "IMELIPWA"),
        "pur_status_credit" to locEntry("CREDIT", "UMWENDA", "CRÉDIT", "MKOPO"),
        "pur_status_partial" to locEntry("PARTIAL", "IGICE", "PARTIEL", "NUSU"),
        "pur_notes_label" to locEntry(
            "Notes (Optional)",
            "Ibisobanuro (Si ngombwa)",
            "Notes (Optionnel)",
            "Maelezo (Hiari)"
        ),
        "pur_total_banner_fmt" to locEntry(
            "Total Inflow Cost: %s",
            "Igiteranyo cy'Ibyaguzwe: %s",
            "Coût total d'achat : %s",
            "Jumla ya Gharama: %s"
        ),
        "pur_save_cta" to locEntry(
            "Save & Update Stock",
            "Bika & Vugurura Ububiko",
            "Enregistrer & Ajouter Stock",
            "Hifadhi & Sasisha Stoo"
        ),

        // =====================================================================
        // ANALYTICS & CHARTS
        // =====================================================================
        "chart_title" to locEntry(
            "Revenue & Profit Trends",
            "Imigendekere y'Inyungu & Ibyaguzwe",
            "Tendances Chiffre d'Affaires & Profits",
            "Mwenendo wa Mapato na Faida"
        ),
        "chart_revenue_legend" to locEntry("Revenue", "Yinjiye", "Revenus", "Mapato"),
        "chart_profit_legend" to locEntry("Profit", "Inyungu", "Bénéfice", "Faida"),
        "chart_empty" to locEntry(
            "No sales data in this period",
            "Nta makuru y'ibigurishijwe muri iki gihe",
            "Aucune donnée de vente sur cette période",
            "Hakuna data ya mauzo katika kipindi hiki"
        ),
        "ana_margin_fmt" to locEntry(
            "%d%% Margin",
            "Inyungu %d%%",
            "Marge %d%%",
            "Faida %d%%"
        ),
        "ana_no_sales_period" to locEntry(
            "No sales data in selected period.",
            "Nta makuru y'ibigurishijwe muri iki gihe wahisemo.",
            "Aucune vente sur la période sélectionnée.",
            "Hakuna mauzo katika kipindi kilichochaguliwa."
        ),
        "ana_product_perf_fmt" to locEntry(
            "%d sold • Rev: %s",
            "%d zagurishijwe • Yinjiye: %s",
            "%d vendus • CA : %s",
            "%d zimeuzwa • Mapato: %s"
        ),
        "ana_forecast_subtitle" to locEntry(
            "Velocity-based 14-day stock-out & reorder advisory",
            "Iteganya ry'ibicuruzwa bigiye gushira mu minsi 14",
            "Prévision de rupture 14 jours et conseil de réappro",
            "Utabiri wa kuisha stoo ndani ya siku 14 na ushauri wa kuagiza"
        ),
        "ana_on_hand_fmt" to locEntry(
            "On hand: %d %s • Rate: %.1f/day",
            "Ibisigaye: %d %s • Umuvuduko: %.1f/umunsi",
            "En stock : %d %s • Vitesse : %.1f/jour",
            "Zilizopo: %d %s • Kasi: %.1f/siku"
        ),
        "ana_days_cover_fmt" to locEntry(
            "%dd stock cover",
            "Bimara iminsi %d",
            "%dj de stock",
            "Siku %d za stoo"
        ),
        "ana_reorder_plus_fmt" to locEntry(
            "Order +%d",
            "Tumiza +%d",
            "Commander +%d",
            "Agiza +%d"
        ),
        "ana_pdf_opened_toast" to locEntry(
            "PDF Report opened!",
            "Raporo ya PDF yafungutse!",
            "Rapport PDF ouvert !",
            "Ripoti ya PDF imefunguliwa!"
        ),
        "ana_share_pdf_title" to locEntry(
            "Share Financial Report PDF",
            "Sangiza Raporo ya PDF",
            "Partager Rapport Financier PDF",
            "Shiriki Ripoti ya Fedha ya PDF"
        ),
        "ana_whatsapp_summary_cta" to locEntry(
            "Share WhatsApp Summary",
            "Ohereza Raporo kuri WhatsApp",
            "Partager Résumé WhatsApp",
            "Shiriki Muhtasari WhatsApp"
        ),
        "ana_whatsapp_report_fmt" to locEntry(
            "*BEBOSS FINANCIAL REPORT (%s)*\nShop: %s\nRevenue: %s\nCost of Goods: %s\n*Net Profit:* %s (%d%% Margin)\nOrders: %d",
            "*RAPORO Y'IMARI YA BEBOSS (%s)*\nUbubiko: %s\nAmafaranga Yinjiye: %s\nIkiguzi cy'Ibyagurishijwe: %s\n*Inyungu Nyayo:* %s (%d%%)\nInyemezabuguzi: %d",
            "*RAPPORT FINANCIER BEBOSS (%s)*\nBoutique : %s\nChiffre d'affaires : %s\nCoût des ventes : %s\n*Bénéfice Net :* %s (Marge %d%%)\nCommandes : %d",
            "*RIPOTI YA FEDHA YA BEBOSS (%s)*\nDuka: %s\nMapato: %s\nGharama za Bidhaa: %s\n*Faida Halisi:* %s (%d%%)\nOda: %d"
        ),

        // =====================================================================
        // CUSTOMERS & DEBT LEDGER
        // =====================================================================
        "cust_search_placeholder" to locEntry(
            "Search customer name or phone...",
            "Shakisha izina cyangwa terefone...",
            "Chercher nom ou téléphone...",
            "Tafuta jina au simu ya mteja..."
        ),
        "cust_clear_all_btn" to locEntry(
            "Clear All",
            "Siba Byose",
            "Tout Effacer",
            "Futa Wote"
        ),
        "cust_total_debtors_fmt" to locEntry(
            "All (%d) • Debtors (%d)",
            "Bose (%d) • Abafite Amadeni (%d)",
            "Tous (%d) • Débiteurs (%d)",
            "Wote (%d) • Wadaiwa (%d)"
        ),
        "cust_filter_debtors" to locEntry(
            "Debtors Only",
            "Abafite Amadeni Gusa",
            "Débiteurs Uniquement",
            "Wadaiwa Pekee"
        ),
        "cust_empty_title" to locEntry(
            "No customers found",
            "Nta mukiriya ubonetse",
            "Aucun client trouvé",
            "Hakuna wateja waliopatikana"
        ),
        "cust_empty_hint" to locEntry(
            "Add customers or import from phone contacts to track debts.",
            "Andika abakiriya cyangwa ubavane muri terefone ugenzure amadeni.",
            "Ajoutez des clients ou importez vos contacts pour suivre les créances.",
            "Ongeza wateja au ingiza kutoka anwani kufuatilia madeni."
        ),
        "cust_no_phone" to locEntry(
            "No phone number",
            "Nta terefone",
            "Pas de numéro",
            "Hakuna namba ya simu"
        ),
        "cust_call_cd" to locEntry("Call customer", "Hamagara", "Appeler", "Piga simu"),
        "cust_sms_cd" to locEntry("Send SMS", "Ohereza SMS", "Envoyer SMS", "Tuma SMS"),
        "cust_whatsapp_cd" to locEntry("WhatsApp reminder", "WhatsApp", "Rappel WhatsApp", "Kikumbusho WhatsApp"),
        "cust_statement_cd" to locEntry("Customer Statement PDF", "Raporo ya PDF", "Relevé Client PDF", "Taarifa ya PDF"),
        "cust_delete_cd" to locEntry("Delete Customer", "Siba Umukiriya", "Supprimer client", "Futa Mteja"),
        "cust_pay_debt_btn" to locEntry("Pay Debt", "Ishyura", "Encaisser", "Lipa Deni"),
        "cust_clear_dialog_title" to locEntry(
            "Clear All Customers?",
            "Usiba Abakiriya Bose?",
            "Effacer tous les clients ?",
            "Futa Wateja Wote?"
        ),
        "cust_clear_dialog_msg" to locEntry(
            "This will remove every customer and debt record permanently. This action cannot be undone.",
            "Ibi bizasiba abakiriya bose n'amadeni yabo burundu. Ntibishobora gusubirwaho.",
            "Cela supprimera définitivement tous les clients et leurs dettes. Action irréversible.",
            "Hii itafuta wateja wote na rekodi za madeni kabisa. Hatua hii haiwezi kutenduliwa."
        ),
        "cust_confirm_clear" to locEntry(
            "Yes, Clear All",
            "Yego, Siba Bose",
            "Oui, Tout Effacer",
            "Ndiyo, Futa Wote"
        ),
        "cust_edit_title" to locEntry(
            "Edit Customer",
            "Hindura Umukiriya",
            "Modifier Client",
            "Hariri Mteja"
        ),
        "cust_category_label" to locEntry(
            "Customer Category",
            "Icyiciro cy'Umukiriya",
            "Catégorie du client",
            "Kategoria ya Mteja"
        ),
        "cust_tin_nin_label" to locEntry(
            "TIN / National ID (Optional)",
            "TIN / Indangamuntu (Si ngombwa)",
            "NIF / CNI (Optionnel)",
            "TIN / Kitambulisho (Hiari)"
        ),
        "cust_opening_debt_label" to locEntry(
            "Opening Debt Balance",
            "Umwenda wa Mbere",
            "Solde dette initial",
            "Deni la Mwanzo"
        ),
        "cust_record_debt_payment_title" to locEntry(
            "Record Debt Payment",
            "Kwakira Kwishyura Umwenda",
            "Encaisser un Paiement de Dette",
            "Rekodi Malipo ya Deni"
        ),
        "cust_payment_amount_label" to locEntry(
            "Payment Amount",
            "Amafaranga Yishyuwe",
            "Montant du paiement",
            "Kiasi Kilicholipwa"
        ),
        "cust_pay_full_btn" to locEntry(
            "Pay Full",
            "Ishyura Yose",
            "Solder Tout",
            "Lipa Yote"
        ),
        "cust_confirm_payment_btn" to locEntry(
            "Confirm Payment",
            "Emeza Kwishyura",
            "Valider Paiement",
            "Thibitisha Malipo"
        ),
        "cust_import_contacts_title" to locEntry(
            "Import Phone Contacts",
            "Injiza Abantu bo muri Terefone",
            "Importer Contacts Téléphone",
            "Ingiza Anwani za Simu"
        ),
        "cust_import_selected_fmt" to locEntry(
            "Import (%d)",
            "Injiza (%d)",
            "Importer (%d)",
            "Ingiza (%d)"
        ),
        "cust_contacts_empty" to locEntry(
            "No contacts with phone numbers found or permission needed.",
            "Nta nimero zibonetse cyangwa hakenewe uburenganzira.",
            "Aucun contact avec numéro trouvé ou permission requise.",
            "Hakuna anwani zenye namba za simu au ruhusa inahitajika."
        ),
        "cust_contacts_imported_toast_fmt" to locEntry(
            "Imported %d contacts!",
            "Abantu %d binjijwe neza!",
            "%d contacts importés !",
            "Anwani %d zimeingizwa!"
        ),
        "cust_reminder_msg_fmt" to locEntry(
            "Hello %s, friendly reminder from %s (%s): Your current outstanding balance is %s. Please settle via MoMo or in store. Thank you!",
            "Muraho %s, uributswa na %s (%s): Umwenda usigaye ni %s. Mwakwishyura kuri MoMo cyangwa ku bubiko. Murakoze!",
            "Bonjour %s, rappel amical de %s (%s) : Votre solde restant est de %s. Merci de régler via MoMo ou en boutique.",
            "Habari %s, ukumbusho kutoka %s (%s): Salio lako la deni ni %s. Tafadhali lipa kupitia MoMo au dukani. Asante!"
        ),

        // =====================================================================
        // SALES HISTORY & SEAL VERIFICATION
        // =====================================================================
        "hist_search_placeholder" to locEntry(
            "Search receipt # or customer name...",
            "Shakisha nimero y'inyemezabuguzi cyangwa umukiriya...",
            "Chercher N° reçu ou nom client...",
            "Tafuta namba ya risiti au jina la mteja..."
        ),
        "hist_empty" to locEntry(
            "No sales history found.",
            "Nta makuru y'ibigurishijwe aboneka.",
            "Aucun historique de ventes trouvé.",
            "Hakuna historia ya mauzo iliyopatikana."
        ),
        "hist_profit_fmt" to locEntry(
            "+%s profit",
            "+%s inyungu",
            "+%s profit",
            "+%s faida"
        ),
        "hist_seal_card_desc" to locEntry(
            "Validate a customer's offline SHA-256 verification seal (BB-...) against local sales records.",
            "Genzura ko kashe y'inyemezabuguzi ya SHA-256 (BB-...) ihura n'ibyagurishijwe.",
            "Vérifiez le sceau hors ligne SHA-256 (BB-...) par rapport aux ventes locales.",
            "Thibitisha muhuri wa risiti wa SHA-256 (BB-...) dhidi ya rekodi za mauzo."
        ),
        "hist_seal_input_label" to locEntry(
            "Receipt # & Seal (e.g. BB-A1B2C3D4E5)",
            "Kashe (urugero: BB-A1B2C3D4E5)",
            "Sceau du reçu (ex. BB-A1B2C3D4E5)",
            "Muhuri wa Risiti (mf. BB-A1B2C3D4E5)"
        ),
        "hist_seal_verify_btn" to locEntry(
            "Verify",
            "Genzura",
            "Vérifier",
            "Thibitisha"
        ),
        "hist_seal_valid_fmt" to locEntry(
            "Authentic receipt #%s (%s) verified!",
            "Inyemezabuguzi y'ukuri #%s (%s) yemejwe!",
            "Reçu authentique #%s (%s) vérifié !",
            "Risiti halali #%s (%s) imethibitishwa!"
        ),
        "hist_seal_invalid" to locEntry(
            "No matching receipt found for this seal code.",
            "Nta nyemezabuguzi ihuye n'iyi kashe.",
            "Aucun reçu correspondant à ce sceau.",
            "Hakuna risiti inayolingana na muhuri huu."
        ),
        "hist_void_title_fmt" to locEntry(
            "Void Receipt #%s?",
            "Usesa Inyemezabuguzi #%s?",
            "Annuler le reçu #%s ?",
            "Batilisha Risiti #%s?"
        ),
        "hist_void_desc" to locEntry(
            "Stock will be automatically restored and recorded in audit logs.",
            "Ibicuruzwa bizasubizwa mu bubiko kandi byandikwe mu bugenzuzi.",
            "Le stock sera restauré automatiquement et enregistré dans le journal d'audit.",
            "Stoo itarejeshwa kiotomatiki na kurekodiwa kwenye ukaguzi."
        ),
        "hist_refund_reason_return" to locEntry(
            "Customer Return",
            "Umukiriya Yabisubije",
            "Retour Client",
            "Mteja Amerudisha"
        ),
        "hist_refund_reason_pricing" to locEntry(
            "Pricing Error",
            "Ikosa ry'Igiciro",
            "Erreur de Prix",
            "Kosa la Bei"
        ),
        "hist_refund_reason_duplicate" to locEntry(
            "Duplicate Entry",
            "Byanditswe Kabiri",
            "Doublon",
            "Ingizo Rudia"
        ),
        "hist_refund_reason_damaged" to locEntry(
            "Damaged Goods",
            "Ibicuruzwa Byangiritse",
            "Marchandise Endommagée",
            "Bidhaa Zilizoharibika"
        ),
        "hist_void_confirm_btn" to locEntry(
            "Void & Restore Stock",
            "Sesa & Subiza Ububiko",
            "Annuler & Restaurer Stock",
            "Batilisha & Rejesha Stoo"
        ),

        // =====================================================================
        // SUBSCRIPTION & PAYWALL SCREENS
        // =====================================================================
        "sub_trial_badge_fmt" to locEntry(
            "FREE TRIAL • %d DAYS LEFT",
            "IGERAGEZA RY'UBUNTU • IMINSI %d ISIGAYE",
            "ESSAI GRATUIT • %d JOURS RESTANTS",
            "MAJARIBIO BURE • SIKU %d ZIMEBAKI"
        ),
        "sub_active_badge_fmt" to locEntry(
            "ACTIVE LICENSE • %d DAYS LEFT",
            "IFATABUGUZI RIKORA • IMINSI %d ISIGAYE",
            "LICENCE ACTIVE • %d JOURS RESTANTS",
            "LESENI HAI • SIKU %d ZIMEBAKI"
        ),
        "sub_step_billing_cycle" to locEntry(
            "1. Select Billing Cycle",
            "1. Hitamo Igihe cy'Ifatabuguzi",
            "1. Choisir la durée d'abonnement",
            "1. Chagua Muda wa Malipo"
        ),
        "sub_1_month" to locEntry("1 Month", "Ukwezi 1", "1 Mois", "Mwezi 1"),
        "sub_3_months" to locEntry("3 Months (-10%)", "Amezi 3 (-10%)", "3 Mois (-10%)", "Miezi 3 (-10%)"),
        "sub_12_months" to locEntry("12 Months (-20%)", "Amezi 12 (-20%)", "12 Mois (-20%)", "Miezi 12 (-20%)"),
        "sub_plan_breakdown" to locEntry(
            "Dynamic Shop Pricing Breakdown",
            "Igiteranyo cy'Igiciro cy'Ububiko",
            "Détail de la tarification boutique",
            "Mchanganuo wa Bei ya Leseni"
        ),
        "sub_branches_row_fmt" to locEntry(
            "Branches (%d)",
            "Amashami (%d)",
            "Agences (%d)",
            "Matawi (%d)"
        ),
        "sub_staff_row_fmt" to locEntry(
            "Staff (%d workers)",
            "Abakozi (%d)",
            "Personnel (%d employés)",
            "Wafanyakazi (%d)"
        ),
        "sub_devices_row_fmt" to locEntry(
            "Paired Devices (%d)",
            "Telefoni (%d)",
            "Appareils (%d)",
            "Vifaa (%d)"
        ),
        "sub_total_payable" to locEntry(
            "TOTAL PAYABLE",
            "AYISHYURWA YOSE",
            "TOTAL À PAYER",
            "JUMLA YA KULIPA"
        ),
        "sub_step_pay_ussd" to locEntry(
            "2. Pay Directly via Operator USSD",
            "2. Ishyura Ukoresheje USSD ya Terefone",
            "2. Payer par USSD Opérateur",
            "2. Lipa Kupitia USSD ya Mtandao"
        ),
        "sub_step_submit_proof" to locEntry(
            "3. Submit Payment Proof for Admin Review",
            "3. Ohereza Gihamya y'Ubwishyu kuri Admin",
            "3. Envoyer la preuve de paiement à l'Admin",
            "3. Tuma Uthibitisho wa Malipo kwa Admin"
        ),
        "sub_momo_sender_phone" to locEntry(
            "Sender MoMo / Airtel Phone *",
            "Nimero Yohereje Amafaranga *",
            "Tél. Payeur MoMo / Airtel *",
            "Namba Iliyotuma Pesa *"
        ),
        "sub_telco_ref_label" to locEntry(
            "Payment note (optional)",
            "Icyitonderwa ku bwishyu (si ngombwa)",
            "Note de paiement (facultative)",
            "Dokezo la malipo (hiari)"
        ),
        "sub_submit_proof_btn" to locEntry(
            "Submit Proof & Notify WhatsApp",
            "Ohereza Gihamya & WhatsApp",
            "Envoyer Preuve & WhatsApp",
            "Tuma Uthibitisho & WhatsApp"
        ),
        "sub_proof_err_missing" to locEntry(
            "Enter the payer phone, full registered name, and payment date/time. No transaction reference is required.",
            "Injiza amazina yuzuye na telefoni by'uwishyuye hamwe n'igihe yishyuye.",
            "Saisissez le nom complet du payeur, son téléphone et l'heure du paiement.",
            "Weka jina kamili na simu ya mlipaji pamoja na muda wa malipo."
        ),
        "sub_proof_submitted_toast" to locEntry(
            "Payment proof queued for Admin verification!",
            "Gihamya yoherejwe! Admin agiye kuyigenzura.",
            "Preuve envoyée pour vérification Admin !",
            "Uthibitisho umetumwa kwa ukaguzi wa Admin!"
        ),
        "sub_status_history_title" to locEntry(
            "Recent Verification Submissions",
            "Ibyoherejwe Kugenjurwa",
            "Soumissions récentes",
            "Mawasilisho ya Hivi Karibuni"
        ),
        "sub_terminal_lock_subtitle" to locEntry(
            "Subscribe to resume POS, Inventory & Multi-Branch Sync",
            "Vugurura ifatabuguzi kugira ngo ukomeze gukoresha POS n'Ububiko",
            "Renouvelez pour continuer les ventes POS, le stock et la sync",
            "Huisha leseni kuendelea na mauzo, stoo na usawazishaji"
        ),
        "sub_unlock_waiting_hint" to locEntry(
            "If you already paid, sync cloud approvals or enter the BB3 code issued for your payment. Historical BB2 codes are verified online.",
            "Niba wishyuye, shakisha ibyemejwe kuri Cloud cyangwa winjize kode ya BB3 yahawe ubwishyu bwawe. Kode za kera za BB2 zigenzurwa kuri internet.",
            "Si vous avez déjà payé, synchronisez les validations cloud ou saisissez le code BB3 de votre paiement. Les anciens BB2 sont vérifiés en ligne.",
            "Ikiwa tayari umelipa, sawazisha idhini za cloud au weka msimbo wa BB3 wa malipo yako. BB2 za zamani hukaguliwa mtandaoni."
        ),
        "sub_invoice_dialog_title" to locEntry(
            "Official Subscription Invoice",
            "Inyemezabuguzi y'Ifatabuguzi",
            "Facture Officielle d'Abonnement",
            "Ankara Rasmi ya Leseni"
        ),
        "sub_pay_dialog_title" to locEntry(
            "Mobile Money License Checkout",
            "Kwishyura Ifatabuguzi na Mobile Money",
            "Paiement Mobile Money",
            "Malipo kwa Mobile Money"
        ),
        "sub_pay_dialog_btn" to locEntry(
            "Verify & Complete Payment",
            "Emeza & Kwishyura",
            "Vérifier & Payer",
            "Thibitisha & Lipa"
        ),

        // =====================================================================
        // SETTINGS SCREEN CARDS & DIALOGS
        // =====================================================================
        "set_hero_subtitle_fmt" to locEntry(
            "%s • %s",
            "%s • %s",
            "%s • %s",
            "%s • %s"
        ),
        "set_select_lang_chip_hint" to locEntry(
            "Choose terminal display language:",
            "Hitamo ururimi rwa porogaramu:",
            "Choisissez la langue d'affichage :",
            "Chagua lugha ya mfumo:"
        ),
        "set_active_operator_label" to locEntry(
            "Active Operator & Terminal",
            "Umukozi Uriho & Kituo",
            "Opérateur & Terminal Actif",
            "Mhudumu & Kituo Kinachotumika"
        ),
        "set_team_branches_title" to locEntry(
            "Team, Branches & Paired Terminals",
            "Abakozi, Amashami & Telefoni",
            "Équipe, Agences & Terminaux",
            "Timu, Matawi & Vifaa"
        ),
        "set_manage_staff_count_fmt" to locEntry(
            "Manage Staff (%d)",
            "Abakozi (%d)",
            "Gérer Équipe (%d)",
            "Wafanyakazi (%d)"
        ),
        "set_manage_branches_count_fmt" to locEntry(
            "Branches (%d)",
            "Amashami (%d)",
            "Agences (%d)",
            "Matawi (%d)"
        ),
        "set_manage_devices_count_fmt" to locEntry(
            "Devices (%d)",
            "Telefoni (%d)",
            "Appareils (%d)",
            "Vifaa (%d)"
        ),
        "set_backup_transfer_btn" to locEntry(
            "Export / Import Offline Backup",
            "Bika / Garura Kopi Offline",
            "Export / Import Sauvegarde",
            "Hamisha / Ingiza Nakala"
        ),
        "set_cloud_last_sync_fmt" to locEntry(
            "Last sync: %s • %d records synced",
            "Iheruka guhuza: %s • Amakuru %d",
            "Dernière sync : %s • %d enreg.",
            "Usawazishaji mwisho: %s • Rekodi %d"
        ),
        "set_admin_console_desc" to locEntry(
            "Verify MoMo payments, approve shops, issue signed BB3 unlock codes or direct-unlock shops, and view cloud logs.",
            "Genzura ubwishyu bwa MoMo, wemeze amaduka, utange kode za BB3 zisinywe cyangwa ufungure iduka ako kanya, urebe amakuru ya cloud.",
            "Vérifiez les paiements MoMo, approuvez les boutiques, émettez des codes BB3 signés ou déverrouillez directement les boutiques, et consultez les journaux cloud.",
            "Hakiki malipo ya MoMo, idhinisha maduka, toa misimbo ya BB3 iliyotiwa saini au fungua duka moja kwa moja, na uangalie kumbukumbu za wingu."
        ),
        "set_shop_address_label" to locEntry("Shop Address", "Aho Ububiko Buherereye", "Adresse boutique", "Anwani ya Duka"),
        "set_shop_phone_label" to locEntry("Business Phone", "Terefone y'Ubucuruzi", "Tél. boutique", "Simu ya Biashara"),
        "set_tin_label" to locEntry("Tax ID / TIN", "Nimero ya TIN", "NIF / TIN", "Namba ya TIN"),
        "set_tax_rate_label" to locEntry("Tax / VAT Rate (%)", "Ijanisha ry'Umusoro (%)", "Taux TVA (%)", "Kiwango cha Kodi (%)"),
        "set_receipt_header_label" to locEntry("Receipt Header Banner", "Ubutumwa bwo Hejuru ku Nyemezabuguzi", "En-tête du reçu", "Kichwa cha Risiti"),
        "set_targets_title" to locEntry(
            "Financial Targets & Cash Drawer",
            "Intego z'Ubucuruzi & Kashi",
            "Objectifs Financiers & Caisse",
            "Malengo ya Fedha & Droo ya Pesa"
        ),
        "set_daily_target_fmt" to locEntry(
            "Daily Sales Target (%s)",
            "Intego y'Umunsi (%s)",
            "Objectif Ventes Jour (%s)",
            "Lengo la Mauzo Leo (%s)"
        ),
        "set_monthly_target_fmt" to locEntry(
            "Monthly Revenue Target (%s)",
            "Intego y'Ukwezi (%s)",
            "Objectif Revenu Mois (%s)",
            "Lengo la Mapato Mwezi (%s)"
        ),
        "set_margin_target_label" to locEntry(
            "Target Profit Margin (%)",
            "Intego y'Inyungu (%)",
            "Marge Cible (%)",
            "Lengo la Faida (%)"
        ),
        "set_cash_float_fmt" to locEntry(
            "Opening Cash Register Float (%s)",
            "Amafaranga yo Gufungura Kashi (%s)",
            "Fond de Caisse Ouverture (%s)",
            "Mtaji wa Kuanzia Drooni (%s)"
        ),
        "set_printer_title" to locEntry(
            "Thermal Printer & Receipt Engine",
            "Imashini Isohora Inyemezabuguzi",
            "Imprimante Thermique & Reçus",
            "Printa ya Risiti & Mipangilio"
        ),
        "set_paper_width_label" to locEntry(
            "Paper Width:",
            "Ubugari bw'Urupapuro:",
            "Largeur du papier :",
            "Upana wa Karatasi:"
        ),
        "set_paper_58mm" to locEntry("58mm Mini", "58mm Nto", "58mm Mini", "58mm Ndogo"),
        "set_paper_80mm" to locEntry("80mm Standard", "80mm Nini", "80mm Standard", "80mm Kawaida"),
        "set_toggle_show_logo" to locEntry("Print Shop Logo Header", "Garagaza Ikirango", "Afficher le logo", "Chapisha Nembo"),
        "set_toggle_show_tax" to locEntry("Show Tax Breakdown on Receipt", "Garagaza Umusoro", "Afficher la TVA sur le reçu", "Onyesha Kodi Kwenye Risiti"),
        "set_toggle_show_barcode" to locEntry("Show Verification Seal / QR", "Garagaza Kashe ya QR", "Afficher le sceau QR", "Onyesha Muhuri / QR"),
        "set_toggle_autoprint" to locEntry("Auto-Print Receipt on Checkout", "Sohora Byikora Nyuma yo Kugura", "Impression auto après vente", "Chapisha Kiotomatiki Baada ya Mauzo"),
        "set_preview_test_print_btn" to locEntry(
            "Preview & Test Thermal Print",
            "Reba & Gerageza Gusohora",
            "Aperçu & Test d'Impression",
            "Hakiki & Jaribu Kuchapisha"
        ),
        "set_sensory_title" to locEntry(
            "POS Sensory Feedback & Alerts",
            "Ijwi & Kunyeganyega bya POS",
            "Retours Sonores & Tactiles POS",
            "Sauti & Mtetemo wa POS"
        ),
        "set_sound_feedback" to locEntry("Audio Chime on Checkout & Scan", "Ijwi ryo Gucuruza no Gusoma", "Son lors des ventes et scans", "Mlio wa Sauti Kwenye Mauzo"),
        "set_haptic_feedback" to locEntry("Tactile Haptic Vibration", "Kunyeganyega mu Ntoki", "Vibration haptique tactile", "Mtetemo wa Kugusa"),
        "set_idle_lock_subtitle" to locEntry(
            "Lock terminal automatically after inactivity:",
            "Funga kituo byikora nyuma y'igihe utagikoresha:",
            "Verrouiller automatiquement après inactivité :",
            "Funga kituo kiotomatiki baada ya kutotumika:"
        ),
        "set_idle_off" to locEntry("Never", "Ntibikora", "Jamais", "Kamwe"),
        "set_idle_min_fmt" to locEntry("%d min", "Imin %d", "%d min", "Dak %d"),
        "set_hardware_security_title" to locEntry(
            "Hardware & Integrity Diagnostics",
            "Umutekano w'Igikoresho & Ubugenzuzi",
            "Sécurité Matérielle & Diagnostics",
            "Usalama wa Kifaa & Uchunguzi"
        ),
        "set_open_diagnostics_btn" to locEntry(
            "Open Security & Sync Diagnostics",
            "Fungura Isuzuma ry'Umutekano",
            "Ouvrir Diagnostics & Audit",
            "Fungua Uchunguzi wa Usalama"
        ),
        "set_db_engine_title" to locEntry(
            "Database Engine & Maintenance",
            "Ububiko bw'Amakuru (SQLCipher)",
            "Moteur de Base de Données",
            "Mfumo wa Hifadhidata (SQLCipher)"
        ),
        "set_verify_integrity_btn" to locEntry("Verify Integrity", "Genzura Ubuziranenge", "Vérifier Intégrité", "Kagua Uadilifu"),
        "set_optimize_db_btn" to locEntry("Optimize & WAL", "Tunganya DB", "Optimiser DB", "Boresha DB"),
        "set_reset_tx_btn" to locEntry("Reset Sales History Only", "Siba Ibyagurishijwe Gusa", "Effacer Ventes Seulement", "Futa Historia ya Mauzo Tu"),
        "set_wipe_products_btn" to locEntry("Wipe All Products", "Siba Ibicuruzwa Byose", "Vider les Produits", "Futa Bidhaa Zote"),
        "set_wipe_customers_btn" to locEntry("Wipe All Customers", "Siba Abakiriya Bose", "Vider les Clients", "Futa Wateja Wote"),
        "set_factory_reset_btn" to locEntry("Factory Reset Whole App", "Subiza Byose ku Ntango", "Réinitialisation Totale", "Rejesha Mfumo Mpya Kabisa"),
        "set_perm_card_title" to locEntry(
            "Device Hardware Permissions",
            "Uburenganzira bw'Igikoresho",
            "Permissions Matérielles",
            "Ruhusa za Vifaa vya Simu"
        ),
        "set_perm_all_granted" to locEntry("ALL ACTIVE", "BYOSE BIRAKORA", "TOUTES ACTIVES", "ZOTE HAI"),
        "set_perm_action_needed" to locEntry("SETUP NEEDED", "BIKENEYE KWEMEZWA", "CONFIGURATION REQUISE", "INAHITAJI RUHUSA"),
        "set_manage_perms_btn" to locEntry("Review Permissions", "Genzura Uburenganzira", "Gérer les Permissions", "Kagua Ruhusa"),
        "set_notif_card_title" to locEntry(
            "Notification Alerts & Channel Tests",
            "Imenyesha & Igerageza rya Notification",
            "Alertes & Tests de Notifications",
            "Arifa & Majaribio ya Vituo"
        ),
        "set_about_title" to locEntry(
            "About BeBoss",
            "Ibyerekeye BeBoss",
            "À propos de BeBoss",
            "Kuhusu BeBoss"
        ),
        "set_about_desc" to locEntry(
            "Offline-first retail management • Sales and inventory stay on this device • Cloud sync runs when connected",
            "Imicungire y'iduka ikora na interineti cyangwa itayifite • Ibyagurishijwe n'ibicuruzwa bibikwa kuri telefoni • Guhuza na cloud bikorwa habonetse interineti",
            "Gestion de commerce hors ligne d'abord • Ventes et stocks conservés sur cet appareil • Synchronisation cloud lorsque la connexion est disponible",
            "Usimamizi wa duka unaofanya kazi bila intaneti • Mauzo na bidhaa hubaki kwenye kifaa • Usawazishaji wa wingu hufanyika mtandao unapopatikana"
        ),
        "set_replay_splash_btn" to locEntry("Replay Brand Intro", "Reba Ikirango cyo Gutangira", "Revoir l'Intro", "Rudia Utangulizi"),
        "set_tx_reset_done_toast" to locEntry(
            "Sales history reset successfully. Catalog preserved!",
            "Amateka y'ibyagurishijwe yasibwe. Ibicuruzwa byagumyeho!",
            "Historique des ventes réinitialisé. Catalogue conservé !",
            "Historia ya mauzo imefutwa. Orodha ya bidhaa imebaki!"
        ),
        "set_wipe_products_title" to locEntry("Wipe All Products?", "Usiba Ibicuruzwa Byose?", "Supprimer tous les produits ?", "Futa Bidhaa Zote?"),
        "set_wipe_products_msg" to locEntry(
            "This will permanently delete ALL products from your catalog. This action cannot be undone.",
            "Ibi bizasiba ibicuruzwa BYOSE mu bubiko burundu. Ntibishobora gusubirwaho.",
            "Tous les produits du catalogue seront définitivement supprimés. Action irréversible.",
            "Hii itafuta bidhaa ZOTE kwenye orodha kabisa. Hatua hii haiwezi kutenduliwa."
        ),
        "set_wipe_products_confirm" to locEntry("Delete All Products", "Siba Ibicuruzwa Byose", "Supprimer Tout", "Futa Bidhaa Zote"),
        "set_wipe_customers_title" to locEntry("Wipe All Customers?", "Usiba Abakiriya Bose?", "Supprimer tous les clients ?", "Futa Wateja Wote?"),
        "set_wipe_customers_msg" to locEntry(
            "This will permanently delete ALL customers and their debt records. This action cannot be undone.",
            "Ibi bizasiba abakiriya BOSE n'amadeni yabo burundu. Ntibishobora gusubirwaho.",
            "Tous les clients et leurs créances seront définitivement supprimés. Action irréversible.",
            "Hii itafuta wateja WOTE na madeni yao kabisa. Hatua hii haiwezi kutenduliwa."
        ),
        "set_wipe_customers_confirm" to locEntry("Delete All Customers", "Siba Abakiriya Bose", "Supprimer Tous les Clients", "Futa Wateja Wote"),
        "set_factory_reset_title" to locEntry("Factory Reset Whole App?", "Usiba Porogaramu Yose?", "Réinitialisation d'Usine ?", "Rejesha Mfumo Mpya Kabisa?"),
        "set_factory_reset_msg" to locEntry(
            "This will completely wipe the application: all products, customers, sales, staff, branches, settings, and licenses. The app will return to first-run state. THIS CANNOT BE UNDONE.",
            "Ibi bizasiba ibintu byose muri porogaramu: ibicuruzwa, abakiriya, ibyagurishijwe, abakozi, amashami n'ifatabuguzi. NTIBISHOBORA GUSUBIRWAHO.",
            "Cela effacera toute l'application : produits, clients, ventes, personnel, agences, réglages et licences. IRRÉVERSIBLE.",
            "Hii itafuta kila kitu kwenye programu: bidhaa, wateja, mauzo, wafanyakazi, matawi, mipangilio na leseni. HAIWEZI KUTENDULIWA."
        ),
        "set_factory_reset_confirm" to locEntry("Factory Reset Everything", "Siba Byose Burundu", "Tout Réinitialiser", "Futa Kila Kitu Kabisa"),
        "set_thermal_preview_title" to locEntry("Thermal Receipt Preview", "Icyitegererezo cy'Inyemezabuguzi", "Aperçu du Reçu Thermique", "Mwonekano wa Risiti ya Printa"),
        "set_thermal_test_print_btn" to locEntry("Print Test Receipt", "Sohora Icyitegererezo", "Imprimer Test", "Chapisha Jaribio"),
        "set_reset_tx_title" to locEntry("Reset Transactional History?", "Usiba Amateka y'Ibyagurishijwe?", "Réinitialiser l'Historique ?", "Futa Historia ya Miamala?"),
        "set_reset_tx_msg" to locEntry(
            "Clears sales, purchases, and debt payments while keeping your product catalog, customers, staff, and license intact.",
            "Bisiba ibyagurishijwe n'ibyishyuwe gusa, ariko ibicuruzwa, abakiriya, abakozi n'ifatabuguzi bigasigara.",
            "Efface les ventes, achats et paiements tout en conservant le catalogue, les clients, l'équipe et la licence.",
            "Hufuta mauzo, manunuzi na malipo huku ikihifadhi bidhaa, wateja, wafanyakazi na leseni."
        ),

        // =====================================================================
        // ADDITIONAL SCREEN KEYS (DASHBOARD, POS, INVENTORY, ANALYTICS, CUSTOMERS, HISTORY, SUBSCRIPTION)
        // =====================================================================
        "dash_trial_banner_desc_hours_fmt" to locEntry(
            "%d day(s) (%dh) left before terminal locks for activation.",
            "Hasigaye iminsi %d (%dh) mbere y'uko porogaramu ifungwa.",
            "%d jour(s) (%dh) restant(s) avant verrouillage du terminal.",
            "Siku %d (Saa %d) zimebaki kabla kituo hakijafungwa."
        ),
        "dash_activate_cta" to locEntry("Activate", "Fungura", "Activer", "Washa"),

        // POS screen
        "pos_clear_cd" to locEntry("Clear", "Siba", "Effacer", "Futa"),
        "pos_scan_barcode_cd" to locEntry("Scan Barcode", "Soma Barcode", "Scanner Code-barres", "Skani Barcode"),
        "pos_held_carts_cd" to locEntry("Held Carts", "Ibitebo Bibitse", "Paniers en attente", "Vikapu Vilivyoshikiliwa"),
        "pos_no_products_found" to locEntry("No products found", "Nta bicuruzwa bibonetse", "Aucun produit trouvé", "Hakuna bidhaa zilizopatikana"),
        "pos_adjust_search_hint" to locEntry(
            "Try adjusting your search or category filter",
            "Gerageza guhindura icyo ushakisha cyangwa icyiciro",
            "Essayez de modifier votre recherche ou catégorie",
            "Jaribu kubadilisha utafutaji au kategoria"
        ),
        "pos_add_new_product" to locEntry("Add New Product", "Ongeramo Igicuruzwa Gishya", "Nouveau Produit", "Ongeza Bidhaa Mpya"),
        "pos_low_stock_tag" to locEntry("Low Stock", "Biri Gushira", "Stock Bas", "Stoo Ndogo"),
        "pos_left_fmt" to locEntry("%s left", "Hasigaye %s", "Reste %s", "Imebaki %s"),
        "pos_in_cart_fmt" to locEntry("%d in cart", "%d mu gitebo", "%d au panier", "%d kikapuni"),
        "pos_add_cd" to locEntry("Add", "Ongeramo", "Ajouter", "Ongeza"),
        "pos_cart_cd" to locEntry("Cart", "Igitebo", "Panier", "Kikapu"),
        "pos_items_in_cart_fmt" to locEntry("%d items in cart", "ibicuruzwa %d mu gitebo", "%d articles au panier", "bidhaa %d kikapuni"),
        "pos_clear_cart_cd" to locEntry("Clear cart", "Siba igitebo", "Vider le panier", "Futa kikapu"),
        "pos_items_count_fmt" to locEntry("Items (%d)", "Ibicuruzwa (%d)", "Articles (%d)", "Bidhaa (%d)"),
        "pos_minus_cd" to locEntry("Minus", "Gabanya", "Moins", "Punguza"),
        "pos_plus_cd" to locEntry("Plus", "Ongera", "Plus", "Ongeza"),
        "pos_link_customer_label" to locEntry("Link to Customer (Optional)", "Huza n'Umukiriya (Si ngombwa)", "Lier à un Client (Optionnel)", "Unganisha na Mteja (Hiari)"),
        "pos_walkin_no_debt" to locEntry("Walk-in Customer (No debt)", "Umuguzi Usanzwe (Nta mwenda)", "Client de passage (Sans dette)", "Mteja wa Kawaida (Bila deni)"),
        "pos_owes_fmt" to locEntry("Owes %s", "Arimo %s", "Doit %s", "Anadaiwa %s"),
        "pos_split_breakdown_title" to locEntry(
            "Split Payment Breakdown (Cash + MoMo)",
            "Kwishyura Uvanzemo (Cash + MoMo)",
            "Répartition Paiement Mixte (Espèces + MoMo)",
            "Mchanganuo wa Malipo (Taslimu + MoMo)"
        ),
        "pos_split_left_fmt" to locEntry("Left: %s", "Hasigaye: %s", "Reste : %s", "Imebaki: %s"),
        "pos_split_cash_fmt" to locEntry("Cash (%s)", "Cash (%s)", "Espèces (%s)", "Taslimu (%s)"),
        "pos_split_momo_fmt" to locEntry("MoMo (%s)", "MoMo (%s)", "MoMo (%s)", "MoMo (%s)"),
        "pos_amount_paid_label" to locEntry("Amount Paid", "Ayishyuwe", "Montant Payé", "Kiasi Kilicholipwa"),
        "pos_subtotal_colon" to locEntry("Subtotal:", "Igiteranyo:", "Sous-total :", "Jumla Ndogo:"),
        "pos_discount_colon" to locEntry("Discount:", "Kugabanyiriza:", "Remise :", "Punguzo:"),
        "pos_total_due_colon" to locEntry("Total Due:", "Ayishyurwa Yose:", "Total à Payer :", "Jumla ya Kulipa:"),
        "pos_est_profit_sale" to locEntry(
            "Estimated Profit from this sale:",
            "Inyungu iteganyijwe kuri iri curuza:",
            "Bénéfice estimé sur cette vente :",
            "Faida inayotarajiwa:"
        ),
        "pos_complete_sale_cta" to locEntry(
            "COMPLETE SALE & ISSUE RECEIPT",
            "EMEZA KUGURA & SOHORA INYEMEZABUGUZI",
            "VALIDER LA VENTE & ÉMETTRE LE REÇU",
            "KAMILISHA MAUZO & TOA RISITI"
        ),
        "pos_held_carts_title_fmt" to locEntry("Held Carts (%d)", "Ibitebo Bibitse (%d)", "Paniers en attente (%d)", "Vikapu Vilivyoshikiliwa (%d)"),
        "pos_resume_cart_cd" to locEntry("Resume cart", "Subukura igitebo", "Reprendre le panier", "Endeleza kikapu"),
        "pos_delete_held_cd" to locEntry("Delete held cart", "Siba igitebo kibitse", "Supprimer le panier", "Futa kikapu"),
        "pos_barcode_lookup_title" to locEntry("Barcode Scanner & Lookup", "Gushakisha Barcode", "Scanner & Recherche Code-barres", "Kichanganuzi na Utafutaji wa Barcode"),
        "pos_enter_scan_barcode" to locEntry("Enter / Scan Barcode", "Injiza / Soma Barcode", "Entrer / Scanner Code-barres", "Weka / Skani Barcode"),
        "pos_quick_barcodes_hint" to locEntry("Quick barcodes in catalog:", "Amakode yihuse mu bubiko:", "Codes-barres rapides du catalogue :", "Misimbo ya haraka stooni:"),
        "pos_price_stock_meta_fmt" to locEntry("Price: %s | Stock: %s", "Igiciro: %s | Ububiko: %s", "Prix : %s | Stock : %s", "Bei: %s | Stoo: %s"),
        "pos_barcode_no_match_fmt" to locEntry(
            "No product matches barcode '%s'",
            "Nta gicuruzwa gihuye na '%s'",
            "Aucun produit ne correspond au code '%s'",
            "Hakuna bidhaa inayolingana na '%s'"
        ),

        // Inventory screen
        "inv_tab_purchases_fmt" to locEntry("Purchases & Inflow (%d)", "Ibyaguzwe (%d)", "Achats & Stock (%d)", "Manunuzi (%d)"),
        "inv_sheet_valuation_title" to locEntry(
            "Inventory Spreadsheet & Valuation",
            "Ububiko & Agaciro k'Ibicuruzwa",
            "Inventaire & Valorisation",
            "Orodha ya Stoo na Thamani"
        ),
        "inv_products_count_fmt" to locEntry("%d Products", "Ibicuruzwa %d", "%d Produits", "Bidhaa %d"),
        "inv_total_cost" to locEntry("Total Cost", "Ikiguzi Cyose", "Coût Total", "Jumla ya Gharama"),
        "inv_retail_value" to locEntry("Retail Value", "Agaciro k'Ugurisha", "Valeur Vente", "Thamani ya Kuuza"),
        "inv_est_profit" to locEntry("Est. Profit", "Inyungu Iteganyijwe", "Bénéfice Est.", "Faida Inayotarajiwa"),
        "inv_import_success_fmt" to locEntry(
            "Successfully imported %d products!",
            "Ibicuruzwa %d byinjijwe neza!",
            "%d produits importés avec succès !",
            "Bidhaa %d zimeingizwa kikamilifu!"
        ),
        "inv_import_empty" to locEntry(
            "No valid products found in CSV file.",
            "Nta bicuruzwa bibonetse muri CSV.",
            "Aucun produit valide trouvé dans le CSV.",
            "Hakuna bidhaa halali zilizopatikana kwenye CSV."
        ),
        "inv_import_err_fmt" to locEntry("Error importing file: %s", "Ikosa mu kwinjiza dosiye: %s", "Erreur d'importation : %s", "Hitilafu ya kuingiza faili: %s"),
        "inv_share_csv_title" to locEntry(
            "Share BeBoss Inventory CSV (Excel)",
            "Sangiza Ububiko bwa CSV",
            "Partager Inventaire CSV (Excel)",
            "Shiriki Stoo ya CSV (Excel)"
        ),
        "inv_share_pdf_title" to locEntry("Share Inventory PDF", "Sangiza Raporo y'Ububiko ya PDF", "Partager Inventaire PDF", "Shiriki PDF ya Stoo"),
        "inv_export_err_fmt" to locEntry("Export error: %s", "Ikosa mu gusohora: %s", "Erreur d'export : %s", "Hitilafu ya kuhamisha: %s"),
        "inv_pdf_err_fmt" to locEntry("PDF error: %s", "Ikosa rya PDF: %s", "Erreur PDF : %s", "Hitilafu ya PDF: %s"),
        "inv_excel_csv_btn" to locEntry("Excel/CSV", "Excel/CSV", "Excel/CSV", "Excel/CSV"),
        "inv_import_csv_btn" to locEntry("Import CSV", "Injiza CSV", "Importer CSV", "Ingiza CSV"),
        "inv_pdf_report_btn" to locEntry("PDF Report", "Raporo PDF", "Rapport PDF", "Ripoti PDF"),
        "inv_low_stock_alert_fmt" to locEntry("Low stock alert (%d)", "Ibicuruzwa biri gushira (%d)", "Alerte stock bas (%d)", "Tahadhari stoo ndogo (%d)"),
        "inv_no_match" to locEntry(
            "No products match your search/filter",
            "Nta gicuruzwa gihuye n'ibyo ushaka",
            "Aucun produit trouvé pour ce filtre",
            "Hakuna bidhaa zinazolingana"
        ),
        "inv_add_to_sheet_btn" to locEntry("+ Add Product to Excel Sheet", "+ Ongeramo Igicuruzwa", "+ Ajouter au Tableau", "+ Ongeza Bidhaa"),
        "inv_col_product_sku" to locEntry("Product / SKU", "Igicuruzwa / Kode", "Produit / SKU", "Bidhaa / SKU"),
        "inv_col_stock" to locEntry("Stock", "Ububiko", "Stock", "Stoo"),
        "inv_col_price_fmt" to locEntry("Price (%s)", "Igiciro (%s)", "Prix (%s)", "Bei (%s)"),
        "inv_col_actions" to locEntry("Actions", "Ibikorwa", "Actions", "Vitendo"),
        "inv_pct_profit_fmt" to locEntry("+%d%% profit", "+%d%% inyungu", "+%d%% marge", "+%d%% faida"),
        "inv_delete_confirm_msg_fmt" to locEntry(
            "Are you sure you want to delete '%s'? This will permanently remove it from your stock sheet.",
            "Uremeza ko usiba '%s'? Kizavaho burundu mu bubiko.",
            "Voulez-vous vraiment supprimer « %s » ? Action définitive.",
            "Je, una hakika unataka kufuta '%s'? Itafutwa kabisa stooni."
        ),
        "inv_form_add_title" to locEntry("Add New Product to Sheet", "Ongeramo Igicuruzwa Gishya", "Nouveau Produit", "Ongeza Bidhaa Mpya"),
        "inv_form_edit_title" to locEntry("Edit Product in Excel Sheet", "Hindura Igicuruzwa", "Modifier le Produit", "Hariri Bidhaa"),
        "inv_form_name" to locEntry("Product Name *", "Izina ry'Igicuruzwa *", "Nom du Produit *", "Jina la Bidhaa *"),
        "inv_form_category" to locEntry("Category", "Icyiciro", "Catégorie", "Kategoria"),
        "inv_form_cost_fmt" to locEntry("Cost Price (Buying) - %s", "Ikiguzi (Ugura) - %s", "Prix d'Achat - %s", "Bei ya Kununua - %s"),
        "inv_form_sell_fmt" to locEntry("Selling Price - %s *", "Igiciro cyo Kugurisha - %s *", "Prix de Vente - %s *", "Bei ya Kuuza - %s *"),
        "inv_form_est_profit_fmt" to locEntry("Est. Profit: +%s", "Inyungu/1: +%s", "Bénéfice Est. : +%s", "Faida: +%s"),
        "inv_form_margin_fmt" to locEntry("Margin: %d%%", "Inyungu: %d%%", "Marge : %d%%", "Faida: %d%%"),
        "inv_form_avail_qty" to locEntry("Available Quantity in Stock *", "Ingano Iri mu Bubiko *", "Quantité en Stock *", "Idadi Iliyopo Stooni *"),
        "inv_form_unit" to locEntry("Unit of Measure (e.g. pcs, kg, boxes, bottles)", "Igipimo (pcs, kg, ikarito, icupa)", "Unité (ex. pcs, kg, boîtes)", "Kipimo (mf. pcs, kg, boksi, chupa)"),
        "inv_form_min_level" to locEntry("Min Stock Alert Level", "Ingano Iburira", "Seuil d'Alerte Stock", "Kiwango cha Tahadhari"),
        "inv_form_barcode_num" to locEntry("Barcode / SKU Number", "Kode / Barcode", "Code-barres / SKU", "Namba ya Barcode / SKU"),
        "inv_form_save_sheet" to locEntry("Save to Excel Sheet", "Bika mu Bubiko", "Enregistrer dans le Tableau", "Hifadhi Stooni"),
        "inv_form_delete_stock" to locEntry("Delete Product from Stock", "Siba Igicuruzwa mu Bubiko", "Supprimer du Stock", "Futa Bidhaa Stooni"),
        "inv_adj_title" to locEntry("Restock / Adjust Stock", "Kongera / Kugabanya Ububiko", "Réapprovisionner / Ajuster", "Jaza / Rekebisha Stoo"),
        "inv_adj_add_mode" to locEntry("+ Restock (Add)", "+ Kongera", "+ Réappro (Ajouter)", "+ Jaza (Ongeza)"),
        "inv_adj_loss_mode" to locEntry("- Damage / Loss", "- Ibyangiritse", "- Casse / Perte", "- Uharibifu / Hasara"),
        "inv_adj_qty_fmt" to locEntry("Quantity (%s)", "Ingano (%s)", "Quantité (%s)", "Kiasi (%s)"),
        "inv_adj_reason" to locEntry("Reason / Note", "Impamvu / Ibisobanuro", "Motif / Note", "Sababu / Maelezo"),
        "inv_adj_default_reason" to locEntry("New supplier shipment / delivery", "Ibicuruzwa bishya byagemuwe", "Nouvelle livraison fournisseur", "Mzigo mpya wa msambazaji"),
        "inv_adj_current_stock" to locEntry("Current Stock", "Ibisigaye", "Stock Actuel", "Stoo ya Sasa"),
        "inv_adj_new_stock" to locEntry("New Stock", "Ububiko Bushya", "Nouveau Stock", "Stoo Mpya"),
        "inv_adj_confirm" to locEntry("Confirm", "Emeza", "Confirmer", "Thibitisha"),

        // Analytics screen
        "ana_forecast_computed_fmt" to locEntry(
            "Computed from %s sales velocity & stock cover",
            "Bibazwa hashingiwe ku muvuduko w'ibigurishwa (%s)",
            "Calculé selon la vélocité des ventes (%s) et le stock",
            "Imekokotolewa kutoka kasi ya mauzo (%s) na stoo"
        ),
        "ana_forecast_healthy" to locEntry(
            "All active inventory items have healthy stock cover for the next 10+ days.",
            "Ibicuruzwa byose bifite ububiko buhagije mu minsi 10 iri imbere.",
            "Tous les articles actifs ont un stock suffisant pour plus de 10 jours.",
            "Bidhaa zote zina stoo ya kutosha kwa zaidi ya siku 10 zijazo."
        ),
        "ana_low_threshold_badge" to locEntry("Low stock threshold", "Bigeze ku muburo", "Seuil d'alerte atteint", "Kiwango cha chini"),
        "ana_order_unit_fmt" to locEntry("Order +%d %s", "Tumiza +%d %s", "Commander +%d %s", "Agiza +%d %s"),
        "ana_est_cost_fmt" to locEntry("Est. %s", "Ikiguzi: %s", "Est. %s", "Makadirio %s"),
        "ana_share_pdf_period_fmt" to locEntry(
            "Share Financial PDF Report (%s)",
            "Sangiza Raporo ya PDF (%s)",
            "Partager Rapport PDF (%s)",
            "Shiriki Ripoti ya PDF (%s)"
        ),
        "ana_pdf_err_fmt" to locEntry("Could not generate PDF: %s", "PDF ntiyashobotse gukorwa: %s", "Impossible de générer le PDF : %s", "Imeshindwa kuunda PDF: %s"),
        "ana_share_text_cta" to locEntry(
            "Share Text Summary to WhatsApp / SMS",
            "Ohereza Raporo kuri WhatsApp / SMS",
            "Partager Résumé par WhatsApp / SMS",
            "Shiriki Muhtasari WhatsApp / SMS"
        ),
        "ana_text_summary_fmt" to locEntry(
            "%s — FINANCIAL SUMMARY\nPeriod: %s\n--------------------------------\nTotal Sales Revenue : %s\nCost of Goods Sold  : %s\nNET PROFIT / LOSS   : %s\nProfit Margin       : %d%%\nTotal Transactions  : %d\n--------------------------------\nGenerated on-device via BeBoss POS\n",
            "%s — RAPORO Y'IMARI\nIgihe: %s\n--------------------------------\nAmafaranga Yinjiye  : %s\nIkiguzi cy'Ibicuruzwa: %s\nINYUNGU NYAYO       : %s\nIjanisha ry'Inyungu : %d%%\nInyemezabuguzi Zose : %d\n--------------------------------\nByakozwe na BeBoss POS\n",
            "%s — RÉSUMÉ FINANCIER\nPériode : %s\n--------------------------------\nChiffre d'affaires  : %s\nCoût des ventes     : %s\nBÉNÉFICE NET        : %s\nMarge bénéficiaire  : %d%%\nTotal Transactions  : %d\n--------------------------------\nGénéré localement par BeBoss POS\n",
            "%s — MUHTASARI WA FEDHA\nKipindi: %s\n--------------------------------\nJumla ya Mapato     : %s\nGharama za Bidhaa   : %s\nFAIDA HALISI        : %s\nAsilimia ya Faida   : %d%%\nIdadi ya Miamala    : %d\n--------------------------------\nImetengenezwa na BeBoss POS\n"
        ),

        // Customers screen
        "cust_share_csv_title" to locEntry("Share Customers & Debts CSV", "Sangiza Abakiriya & Amadeni CSV", "Partager Clients & Dettes CSV", "Shiriki Wateja na Madeni CSV"),
        "cust_search_long_hint" to locEntry("Search customer name, phone, city...", "Shakisha izina, terefone, umujyi...", "Chercher client, téléphone, ville...", "Tafuta jina, simu, mji..."),
        "cust_all_count_fmt" to locEntry("All (%d)", "Bose (%d)", "Tous (%d)", "Wote (%d)"),
        "cust_owes_count_fmt" to locEntry("Owes Debt (%d)", "Abafite Umwenda (%d)", "Avec Dette (%d)", "Wanaodaiwa (%d)"),
        "cust_empty_ledger" to locEntry("No customers found in ledger", "Nta mukiriya uri mu gitabo", "Aucun client dans le registre", "Hakuna mteja kwenye daftari"),
        "cust_add_to_ledger_btn" to locEntry("+ Add Customer to Ledger", "+ Andika Umukiriya", "+ Ajouter un Client", "+ Ongeza Mteja"),
        "cust_no_phone_toast_fmt" to locEntry("No phone number for %s", "Nta nimero ya terefone ya %s", "Aucun numéro pour %s", "Hakuna namba ya simu ya %s"),
        "cust_statement_title_fmt" to locEntry("Statement - %s", "Raporo - %s", "Relevé - %s", "Taarifa - %s"),
        "cust_stmt_err_fmt" to locEntry("Error generating statement: %s", "Ikosa mu gukora raporo: %s", "Erreur lors du relevé : %s", "Hitilafu ya kuunda taarifa: %s"),
        "cust_imported_toast_fmt" to locEntry("Imported %d contacts successfully!", "Abantu %d binjijwe neza!", "%d contacts importés avec succès !", "Anwani %d zimeingizwa kikamilifu!"),
        "cust_col_name_phone" to locEntry("Customer Name & Phone", "Izina & Terefone", "Nom & Téléphone", "Jina & Simu"),
        "cust_col_debt_fmt" to locEntry("Debt (%s)", "Umwenda (%s)", "Dette (%s)", "Deni (%s)"),
        "cust_unpaid_debt" to locEntry("Unpaid Debt", "Umwenda", "Dette Impayée", "Deni Linalodaiwa"),
        "cust_cleared_zero" to locEntry("Cleared (0)", "Nta mwenda (0)", "Soldé (0)", "Hana Deni (0)"),
        "cust_pay_cd" to locEntry("Pay", "Ishyura", "Payer", "Lipa"),
        "cust_reminder_cd" to locEntry("Reminder", "Ibutsa", "Rappel", "Kikumbusho"),
        "cust_call_action_cd" to locEntry("Call", "Hamagara", "Appeler", "Piga"),
        "cust_delete_confirm_msg_fmt" to locEntry(
            "Are you sure you want to delete '%s'? Outstanding debt history will be removed.",
            "Uremeza ko usiba '%s'? Amateka y'amadeni ye azakurwaho.",
            "Supprimer « %s » ? L'historique de ses dettes sera effacé.",
            "Je, una hakika unataka kufuta '%s'? Rekodi za madeni yake zitafutwa."
        ),
        "cust_form_add_title" to locEntry("Add New Customer", "Ongeramo Umukiriya", "Nouveau Client", "Ongeza Mteja Mpya"),
        "cust_form_edit_title" to locEntry("Edit Customer in Ledger", "Hindura Umukiriya", "Modifier le Client", "Hariri Mteja"),
        "cust_autofill_contacts" to locEntry("Auto-Fill from Device Contacts", "Kura mu Bantu bo muri Terefone", "Remplir depuis les Contacts", "Jaza Kutoka Anwani za Simu"),
        "cust_imported_one_toast_fmt" to locEntry("Imported %s from Phonebook!", "%s yakuwe muri terefone!", "%s importé des contacts !", "%s ameingizwa kutoka anwani!"),
        "cust_name_label" to locEntry("Customer Name *", "Izina ry'Umukiriya *", "Nom du Client *", "Jina la Mteja *"),
        "cust_phone_wa_label" to locEntry("Phone / WhatsApp Number", "Terefone / WhatsApp", "Téléphone / WhatsApp", "Simu / WhatsApp"),
        "cust_city_label" to locEntry("City / Town", "Umujyi / Akarere", "Ville / Localité", "Mji / Wilaya"),
        "cust_init_debt_fmt" to locEntry("Initial Debt Balance (%s)", "Umwenda wa Mbere (%s)", "Solde Dette Initial (%s)", "Deni la Mwanzo (%s)"),
        "cust_address_label" to locEntry("Physical Address / Sector", "Aderesi / Umurenge", "Adresse / Secteur", "Anwani / Kata"),
        "cust_notes_label" to locEntry("Notes & Preferences", "Ibisobanuro", "Notes & Préférences", "Maelezo na Mapendeleo"),
        "cust_save_profile_btn" to locEntry("Save Customer Profile", "Bika Umukiriya", "Enregistrer le Client", "Hifadhi Mteja"),
        "cust_delete_from_system" to locEntry("Delete Customer from System", "Siba Umukiriya Burundu", "Supprimer le Client", "Futa Mteja Kabisa"),
        "cust_debt_dialog_title" to locEntry("Debt Payment", "Kwishyura Umwenda", "Paiement de Dette", "Malipo ya Deni"),
        "cust_debt_customer_fmt" to locEntry("Customer: %s", "Umukiriya: %s", "Client : %s", "Mteja: %s"),
        "cust_debt_total_label" to locEntry("Total Debt:", "Umwenda wose:", "Dette Totale :", "Jumla ya Deni:"),
        "cust_debt_paid_label_fmt" to locEntry("Amount Paid (%s)", "Amafaranga Yishyuwe (%s)", "Montant Payé (%s)", "Kiasi Kilicholipwa (%s)"),
        "cust_debt_half_fmt" to locEntry("Half (%d)", "Igice (%d)", "Moitié (%d)", "Nusu (%d)"),
        "cust_debt_full_fmt" to locEntry("Pay Full (%d)", "Ishyura Yose (%d)", "Solder Tout (%d)", "Lipa Yote (%d)"),
        "cust_debt_will_clear" to locEntry("Debt will be fully cleared!", "Umwenda uzashira wose!", "La dette sera totalement soldée !", "Deni litamalizwa lote!"),
        "cust_debt_remaining_label" to locEntry("Remaining Debt:", "Umwenda usigaye:", "Reste à Payer :", "Deni Linalobaki:"),
        "cust_debt_settled_zero_fmt" to locEntry("Debt will be fully settled to 0 %s", "Umwenda uzagera kuri 0 %s", "La dette passera à 0 %s", "Deni litabaki 0 %s"),
        "cust_debt_method_label" to locEntry("Payment Method:", "Uburyo Bwishyuwe:", "Mode de Paiement :", "Njia ya Malipo:"),
        "cust_debt_save_btn" to locEntry("Save Payment", "Bika Kwishyura", "Enregistrer Paiement", "Hifadhi Malipo"),
        "cust_contacts_perm_denied" to locEntry("Contacts permission denied", "Uburenganzira bwa terefone bwanzwe", "Permission contacts refusée", "Ruhusa ya anwani imekataliwa"),
        "cust_contacts_select_hint" to locEntry(
            "Select contacts from your phone to add as shop customers:",
            "Hitamo abantu muri terefone ushaka kugira abakiriya:",
            "Sélectionnez les contacts à ajouter comme clients :",
            "Chagua anwani za kuongeza kama wateja:"
        ),
        "cust_contacts_reading" to locEntry("Reading phonebook contacts...", "Gusoma abantu bari muri terefone...", "Lecture du répertoire...", "Inasoma anwani za simu..."),
        "cust_contacts_none" to locEntry("No contacts found in phonebook.", "Nta bantu babonetse muri terefone.", "Aucun contact trouvé dans le répertoire.", "Hakuna anwani zilizopatikana."),
        "cust_reminder_sms_due_fmt" to locEntry(
            "Hello %s,\n\nThis is an official statement from *%s*.\nYour pending balance is *%s*.\n\nPlease settle via MTN MoMo / Airtel Money / Cash at your earliest convenience. Thank you!",
            "Muraho %s,\n\nUbu ni ubutumwa bwa *%s*.\nUmwenda musigaye ni *%s*.\n\nMwakwishyura kuri MTN MoMo / Airtel Money / Cash igihe cyose bibashobokeye. Murakoze cyane!",
            "Bonjour %s,\n\nCeci est un relevé officiel de *%s*.\nVotre solde restant est de *%s*.\n\nMerci de régler via MTN MoMo / Airtel Money / Espèces dès que possible. Merci !",
            "Habari %s,\n\nHii ni taarifa rasmi kutoka *%s*.\nDeni lako lililobaki ni *%s*.\n\nTafadhali lipa kupitia MTN MoMo / Airtel Money / Taslimu mapema uwezavyo. Asante sana!"
        ),
        "cust_reminder_sms_thanks_fmt" to locEntry(
            "Hello %s,\n\nThis is an official statement from *%s*.\nThank you for your regular patronage and timely payments!",
            "Muraho %s,\n\nUbu ni ubutumwa bwa *%s*.\nTurabashimira cyane kubera gukorana natwe no kwishyura neza!",
            "Bonjour %s,\n\nCeci est un relevé officiel de *%s*.\nMerci pour votre fidélité et vos paiements ponctuels !",
            "Habari %s,\n\nHii ni taarifa rasmi kutoka *%s*.\nAsante kwa kuendelea kufanya biashara nasi na kulipa kwa wakati!"
        ),

        // Sales history screen
        "hist_void_bullets_fmt" to locEntry(
            "Receipt #%s (%s)\n• Stock will be atomically restored\n• Credit debt will be recalculated\n• Owner/Manager approval & audit entry recorded.",
            "Inyemezabuguzi #%s (%s)\n• Ibicuruzwa bizasubizwa mu bubiko\n• Amadeni azasubirwamo\n• Ubugenzuzi bw'ubuyobozi buzakorwa.",
            "Reçu #%s (%s)\n• Stock restauré automatiquement\n• Dette client recalculée\n• Journal d'audit enregistré.",
            "Risiti #%s (%s)\n• Stoo itarejeshwa kiotomatiki\n• Deni la mteja litahesabiwa upya\n• Ukaguzi utarekodiwa."
        ),
        "hist_refund_reason_label" to locEntry("Mandatory Refund / Void Reason *", "Impamvu yo Gusesa Inyemezabuguzi *", "Motif Obligatoire d'Annulation *", "Sababu ya Lazima ya Kubatilisha *"),
        "hist_refund_reason_hint" to locEntry("Enter audit reason...", "Andika impamvu y'ubugenzuzi...", "Saisir le motif d'audit...", "Weka sababu ya ukaguzi..."),
        "hist_approve_void_btn" to locEntry("Approve Refund & Void", "Emeza Gusesa", "Valider l'Annulation", "Thibitisha Kubatilisha"),
        "hist_delete_void_cd" to locEntry("Delete / Void Sale", "Sesa Icyagurishijwe", "Annuler la Vente", "Futa / Batilisha Mauzo"),
        "hist_seal_verifier_desc" to locEntry(
            "Verify any printed or shared BeBoss receipt offline against its tamper-evident SHA-256 BB-seal.",
            "Genzura ko inyemezabuguzi ya BeBoss ari umwimerere ukoresheje kashe yayo ya SHA-256.",
            "Vérifiez tout reçu BeBoss hors ligne grâce à son sceau cryptographique SHA-256 BB-.",
            "Thibitisha risiti yoyote ya BeBoss nje ya mtandao kwa muhuri wake wa SHA-256."
        ),
        "hist_receipt_num_input_label" to locEntry("Receipt Number (e.g. REC-...)", "Nimero y'Inyemezabuguzi (REC-...)", "N° de Reçu (ex. REC-...)", "Namba ya Risiti (mf. REC-...)"),
        "hist_printed_seal_input_label" to locEntry("Printed Seal (e.g. BB-A1B2C3D4E5)", "Kashe Yanditse (BB-A1B2C3D4E5)", "Sceau Imprimé (ex. BB-A1B2C3D4E5)", "Muhuri Uliochapishwa (BB-A1B2C3D4E5)"),
        "hist_seal_not_found_fmt" to locEntry(
            "NOT FOUND: No local sale matches receipt '%s'.",
            "NTIBYABONETSE: Nta nyemezabuguzi ihuye na '%s'.",
            "INTROUVABLE : Aucune vente locale ne correspond à « %s ».",
            "HAIJAPATIKANA: Hakuna mauzo yanayolingana na risiti '%s'."
        ),
        "hist_seal_authentic_fmt" to locEntry(
            "AUTHENTIC: Receipt #%s (%s) matches cryptographic seal.",
            "UMWIMERERE: Inyemezabuguzi #%s (%s) ihuye neza na kashe.",
            "AUTHENTIQUE : Le reçu #%s (%s) correspond au sceau.",
            "HALALI: Risiti #%s (%s) inalingana na muhuri wa usalama."
        ),
        "hist_seal_tampered_fmt" to locEntry(
            "TAMPERED / MISMATCH: Seal does not match local sale #%s!",
            "YAHINDUWE / NTIHURA: Kashe ntihura n'inyemezabuguzi #%s!",
            "FALSIFIÉ / INVALIDE : Le sceau ne correspond pas au reçu #%s !",
            "IMEGHUSHIWA / HAILINGANI: Muhuri haulingani na mauzo #%s!"
        ),
        "hist_verify_offline_btn" to locEntry("Verify Offline", "Genzura Offline", "Vérifier Hors Ligne", "Thibitisha Nje ya Mtandao"),

        // Subscription & Paywall
        "sub_licensing_title" to locEntry("BeBoss Multi-Branch Licensing", "Ifatabuguzi rya BeBoss ry'Amashami", "Licence Multi-Agences BeBoss", "Leseni ya Matawi Mengi ya BeBoss"),
        "sub_hero_meta_fmt" to locEntry("%s • @%s • Expires %s", "%s • @%s • Irangira %s", "%s • @%s • Expire le %s", "%s • @%s • Inaisha %s"),
        "sub_copied_device_fmt" to locEntry("Copied Device Code: %s", "Kode ya Telefoni Yakopiwe: %s", "Code appareil copié : %s", "Msimbo wa Kifaa Umenakiliwa: %s"),
        "sub_copy_device_cd" to locEntry("Copy Device Code", "Kopera Kode ya Telefoni", "Copier Code Appareil", "Nakili Msimbo wa Kifaa"),
        "sub_step1_title" to locEntry("Step 1: Choose Branch & Staff Plan", "Intambwe 1: Hitamo Amashami & Abakozi", "Étape 1 : Agences & Personnel", "Hatua 1: Chagua Matawi & Wafanyakazi"),
        "sub_1_branch" to locEntry("1 Branch", "Ishami 1", "1 Agence", "Tawi 1"),
        "sub_2_branches" to locEntry("2 Branches", "Amashami 2", "2 Agences", "Matawi 2"),
        "sub_3_branches" to locEntry("3+ Branches", "Amashami 3+", "3+ Agences", "Matawi 3+"),
        "sub_workers_admin" to locEntry("Shop Workers Administered:", "Umubare w'Abakozi:", "Employés Gérés :", "Wafanyakazi Wanaosimamiwa:"),
        "sub_dec_staff_cd" to locEntry("Decrease staff count", "Gabanya abakozi", "Réduire le personnel", "Punguza wafanyakazi"),
        "sub_inc_staff_cd" to locEntry("Increase staff count", "Ongera abakozi", "Augmenter le personnel", "Ongeza wafanyakazi"),
        "sub_devices_addon_fmt" to locEntry("%s (+2,000 FRw/added):", "%s (+2,000 FRw/imwe):", "%s (+2 000 FRw/suppl.) :", "%s (+2,000 FRw/kifaa):"),
        "sub_dec_device_cd" to locEntry("Decrease device count", "Gabanya telefoni", "Réduire appareils", "Punguza vifaa"),
        "sub_inc_device_cd" to locEntry("Increase device count", "Ongera telefoni", "Augmenter appareils", "Ongeza vifaa"),
        "sub_3_mo_short" to locEntry("3 Mo (-10%)", "Amezi 3 (-10%)", "3 Mois (-10%)", "Miezi 3 (-10%)"),
        "sub_1_yr_short" to locEntry("1 Yr (-20%)", "Umwaka 1 (-20%)", "1 An (-20%)", "Mwaka 1 (-20%)"),
        "sub_total_ussd_payable" to locEntry("Total USSD Payable:", "Igiteranyo cyo Kwishyura:", "Total USSD à Payer :", "Jumla ya Kulipa USSD:"),
        "sub_plus_days_fmt" to locEntry("+%d Days", "+Iminsi %d", "+%d Jours", "+Siku %d"),
        "sub_step2_title" to locEntry("Step 2: Pay by USSD & Send Proof for Admin Review", "Intambwe 2: Ishyura USSD & Ohereza Gihamya", "Étape 2 : Paiement USSD & Preuve pour Admin", "Hatua 2: Lipa kwa USSD & Tuma Uthibitisho"),
        "sub_live_pay_config_title" to locEntry("Live Admin Payment & WhatsApp Settings", "Amakuru yo Kwishyuriraho ya Admin", "Paramètres Paiement & WhatsApp Admin", "Mipangilio ya Malipo na WhatsApp ya Admin"),
        "sub_mtn_config_row_fmt" to locEntry("MTN *182#: Code %s (%s) → %s", "MTN *182#: Kode %s (%s) → %s", "MTN *182# : Code %s (%s) → %s", "MTN *182#: Msimbo %s (%s) → %s"),
        "sub_airtel_config_row_fmt" to locEntry("Airtel *500#: %s (%s) → %s", "Airtel *500#: %s (%s) → %s", "Airtel *500# : %s (%s) → %s", "Airtel *500#: %s (%s) → %s"),
        "sub_admin_wa_row_fmt" to locEntry("Admin WhatsApp: %s", "WhatsApp ya Admin: %s", "WhatsApp Admin : %s", "WhatsApp ya Admin: %s"),
        "sub_admin_wa_unset" to locEntry("Set Admin WhatsApp in Admin Console -> Pay Config", "Shyiraho WhatsApp mu Igenamiterere rya Admin", "Définir WhatsApp dans Console Admin -> Config Paiement", "Weka WhatsApp katika Dashibodi ya Admin"),
        "sub_ussd_instructions_fmt" to locEntry(
            "1) Complete the %d FRw payment in the operator's USSD flow.\n2) Submit payer name and phone, payment time, selected plan and an optional note in BeBoss. No transaction reference is required. An admin checks the provider statement before issuing a unique BB3 code or approving cloud unlock. Opening USSD alone does not confirm payment.",
            "1) Ishyura %d FRw ukoresheje USSD ya MTN cyangwa Airtel.\n2) Ohereza amazina na telefoni by'uwishyuye, igihe yishyuye, gahunda wahisemo n'icyitonderwa niba gihari. Nta nimero y'igikorwa isabwa. Admin agenzura inyandiko za MTN cyangwa Airtel mbere yo gutanga kode ya BB3 cyangwa kwemeza gufungura kuri cloud.",
            "1) Payez %d FRw via USSD MTN ou Airtel.\n2) Envoyez le nom et le téléphone du payeur, l'heure du paiement, le forfait choisi et une note facultative. Aucune référence de transaction n'est demandée. L'admin vérifie le relevé opérateur avant d'émettre un code BB3 unique ou d'approuver le déblocage cloud.",
            "1) Kamilisha malipo ya %d FRw kwa USSD.\n2) Tuma jina na simu ya mlipaji, muda wa malipo, mpango uliochaguliwa na dokezo la hiari. Hakuna namba ya muamala inayohitajika. Msimamizi hukagua taarifa za mtoa huduma kabla ya kutoa BB3 ya kipekee au kuidhinisha ufunguaji wa cloud."
        ),
        "sub_mtn_ussd_btn" to locEntry("MTN USSD *182#", "MTN USSD *182#", "USSD MTN *182#", "USSD MTN *182#"),
        "sub_airtel_ussd_btn" to locEntry("Airtel USSD *500#", "Airtel USSD *500#", "USSD Airtel *500#", "USSD Airtel *500#"),
        "sub_creds_to_wa_header" to locEntry("Credentials Sent to Admin WhatsApp (for Verification & Unlock):", "Amakuru Yoherezwa kuri WhatsApp ya Admin:", "Informations envoyées sur WhatsApp Admin :", "Taarifa Zinazotumwa WhatsApp ya Admin:"),
        "sub_created_username_label" to locEntry("Created Account Username *", "Username ya Konti *", "Nom d'utilisateur du compte *", "Jina la Akaunti (Username) *"),
        "sub_registered_phone_label" to locEntry("Registered Account Phone Number *", "Nimero ya Terefone Yanditseho *", "Téléphone enregistré du compte *", "Namba ya Simu Iliyosajiliwa *"),
        "sub_sender_phone_short_label" to locEntry("Sender MoMo Phone *", "Terefone Yohereje *", "Tél. Payeur *", "Simu Iliyotuma *"),
        "sub_momo_ref_opt_label" to locEntry("Payment note (optional)", "Icyitonderwa ku bwishyu (si ngombwa)", "Note de paiement (facultative)", "Dokezo la malipo (hiari)"),
        "sub_proof_err_required" to locEntry(
            "Please enter Username, Registered Phone, and Full Names on the sender phone.",
            "Injiza Username, Terefone yanditseho n'amazina yuzuye y'uwohereje.",
            "Saisissez l'identifiant, le téléphone enregistré et le nom complet du payeur.",
            "Weka jina la mtumiaji, simu iliyosajiliwa na majina kamili ya mtumaji."
        ),
        "sub_submit_wa_proof_btn" to locEntry("Submit & Send Proof via WhatsApp", "Ohereza Gihamya kuri WhatsApp", "Soumettre & Envoyer via WhatsApp", "Tuma Uthibitisho kwa WhatsApp"),
        "sub_submit_direct_ref_btn" to locEntry("Submit payment proof", "Ohereza gihamya y'ubwishyu", "Envoyer la preuve de paiement", "Tuma uthibitisho wa malipo"),
        "sub_paste_bb2_hint_fmt" to locEntry(
            "Enter the payment-linked BB3 code issued for @%s (%s). Historical BB2 codes are checked online against their original issue record.",
            "Injiza kode ya BB3 ijyanye n'ubwishyu yatangiwe @%s (%s). Kode za kera za BB2 zigenzurwa kuri internet hakurikijwe inyandiko zatangiweho.",
            "Saisissez le code BB3 lié au paiement émis pour @%s (%s). Les anciens codes BB2 sont vérifiés en ligne à partir de leur enregistrement d'origine.",
            "Weka msimbo wa BB3 unaohusishwa na malipo uliotolewa kwa @%s (%s). Misimbo ya zamani ya BB2 hukaguliwa mtandaoni kulingana na rekodi yake ya awali."
        ),
        "sub_recent_requests_fmt" to locEntry("Recent Payment Verification Requests (%d)", "Ibyoherejwe Kugenjurwa (%d)", "Demandes de Vérification (%d)", "Maombi ya Hivi Karibuni (%d)"),
        "sub_req_meta_fmt" to locEntry("@%s (%s) • %d dev • %s • %s", "@%s (%s) • tel %d • %s • %s", "@%s (%s) • %d app. • %s • %s", "@%s (%s) • vifaa %d • %s • %s"),
        "sub_synced_supabase" to locEntry("Synced to Supabase", "Byahujwe kuri Cloud", "Synchronisé Supabase", "Imesawazishwa Wingu"),
        "sub_saved_offline" to locEntry("Saved Offline", "Bibitswe Offline", "Enregistré Hors Ligne", "Imehifadhiwa Nje ya Mtandao"),
        "sub_apply_code_btn" to locEntry("Apply Code", "Shyiraho Kode", "Appliquer", "Tumia Msimbo"),
        "sub_wa_admin_support_btn" to locEntry("WhatsApp Admin Support", "Ubufasha kuri WhatsApp", "Support WhatsApp Admin", "Msaada WhatsApp Admin"),
        "sub_sync_approved_cloud_btn" to locEntry("Sync Approved Cloud Unlock", "Shakisha Ibyemejwe kuri Cloud", "Synchroniser Déblocage Cloud", "Sawazisha Ufunguaji Wingu"),
        "sub_official_receipt_title" to locEntry("Official Subscription Receipt", "Inyemezabuguzi y'Ifatabuguzi", "Reçu Officiel d'Abonnement", "Risiti Rasmi ya Leseni"),
        "sub_share_print_invoice" to locEntry("Share / Print Invoice", "Sangiza / Sohora Inyemezabuguzi", "Partager / Imprimer Facture", "Shiriki / Chapisha Ankara"),
        "sub_terminal_locked_cd" to locEntry("App Locked", "Porogaramu Irafunze", "Application Verrouillée", "Programu Imefungwa"),
        "sub_terminal_locked_fmt" to locEntry("%s • Terminal Locked", "%s • Kituo Kirafunze", "%s • Terminal Verrouillé", "%s • Kituo Kimefungwa"),
        "sub_open_admin_console_cd" to locEntry("Open Master Admin Console", "Fungura Ubuyobozi Mukuru", "Ouvrir Console Master Admin", "Fungua Dashibodi ya Admin"),
        "sub_momo_proof_title" to locEntry("Mobile Money payment proof", "Gihamya y'Ubwishyu bwa MoMo", "Preuve de paiement Mobile Money", "Uthibitisho wa malipo ya MoMo"),
        "sub_total_days_fmt" to locEntry("Total: %d FRw (%d Days)", "Yose: %d FRw (Iminsi %d)", "Total : %d FRw (%d Jours)", "Jumla: %d FRw (Siku %d)"),
        "sub_payer_phone_hint" to locEntry("Payer Phone Number (078... / 073...)", "Terefone Yishyura (078... / 073...)", "Numéro Payeur (078... / 073...)", "Namba ya Mlipaji (078... / 073...)"),
        "sub_dialer_status_fmt" to locEntry(
            "Dialer opened for %s. Complete payment with the operator, then submit payer details, payment time and plan for admin review.",
            "USSD ya %s yafungutse. Rangiza kwishyura, wohereze amazina na telefoni by'uwishyuye, igihe na gahunda kuri Admin.",
            "Composeur ouvert pour %s. Terminez le paiement puis envoyez le payeur, l'heure et le forfait à l'admin.",
            "Piga imefunguliwa kwa %s. Kamilisha malipo kisha tuma jina na simu ya mlipaji, muda na mpango kwa Admin."
        ),
        "sub_dial_ussd_fmt" to locEntry("Dial USSD (%s)", "Kanda USSD (%s)", "Composer USSD (%s)", "Piga USSD (%s)"),
        "sub_tx_ref_label" to locEntry("Payment note (optional)", "Icyitonderwa ku bwishyu (si ngombwa)", "Note de paiement (facultative)", "Dokezo la malipo (hiari)"),
        "sub_ref_format_note" to locEntry(
            "A payment note is for context only. An admin must verify the payment against the mobile-money provider statement.",
            "Icyitonderwa ku bwishyu gitanga amakuru gusa. Umuyobozi agomba kugenzura ko MTN cyangwa Airtel yemeje ubwishyu.",
            "La note de paiement sert uniquement de contexte. Un administrateur doit vérifier le règlement sur le relevé de l'opérateur mobile.",
            "Dokezo la malipo ni maelezo tu. Msimamizi lazima ahakiki malipo kwenye taarifa ya mtoa huduma wa simu."
        ),
        "sub_checking_ref" to locEntry("Saving payment proof...", "Kubika gihamya y'ubwishyu...", "Enregistrement de la preuve...", "Inahifadhi uthibitisho wa malipo..."),
        "sub_checking_btn" to locEntry("Checking...", "Birimo kugenzurwa...", "Vérification...", "Inakagua..."),
        "sub_check_ref_btn_fmt" to locEntry("Check reference (%d FRw)", "Genzura kode (%d FRw)", "Vérifier référence (%d FRw)", "Kagua kumbukumbu (%d FRw)")
    )
}
