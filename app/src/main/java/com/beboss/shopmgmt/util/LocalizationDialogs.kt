package com.beboss.shopmgmt.util

internal object LocalizationDialogs {
    val entries: Map<String, Map<AppLanguage, String>> = mapOf(
        // =====================================================================
        // PERMISSIONS DIALOG & HARDWARE ITEMS
        // =====================================================================
        "perm_dialog_title" to locEntry(
            "Device Access & Permissions",
            "Uburenganzira bwa Sisitemu",
            "Accès & Permissions Appareil",
            "Ruhusa na Ufikiaji wa Kifaa"
        ),
        "perm_dialog_subtitle" to locEntry(
            "Enables real-time advanced retail features",
            "Ibi bifasha BeBoss gukora neza 100%",
            "Active les fonctionnalités avancées en temps réel",
            "Huwezesha vipengele vya juu vya duka papo hapo"
        ),
        "perm_all_granted_banner" to locEntry(
            "All permissions granted! Full features active.",
            "Uburenganzira bwose bwemejwe neza!",
            "Toutes les permissions accordées ! Toutes les fonctions sont actives.",
            "Ruhusa zote zimetolewa! Vipengele vyote vinafanya kazi."
        ),
        "perm_grant_all_btn" to locEntry(
            "Grant All Permissions",
            "Emeza Byose Hamwe (1-Tap)",
            "Tout Autoriser",
            "Ruhusu Zote"
        ),
        "perm_app_settings_btn" to locEntry(
            "App Settings",
            "Igenamiterere rya App",
            "Paramètres App",
            "Mipangilio ya App"
        ),
        "perm_active_badge" to locEntry("Active", "Birakora", "Actif", "Hai"),
        "perm_allow_btn" to locEntry("Allow", "Emeza", "Autoriser", "Ruhusu"),
        "perm_contacts_title" to locEntry(
            "Phone Contacts Access",
            "Uburenganzira bwa Contacts",
            "Accès aux Contacts Téléphone",
            "Ufikiaji wa Anwani za Simu"
        ),
        "perm_contacts_desc" to locEntry(
            "Import customer names, phones and addresses directly from your device phonebook with 1 tap.",
            "Kwinjiza abakiriya, amazina na telefone zabo ako kanya uvanye muri telefoni yawe.",
            "Importez noms, numéros et adresses clients depuis votre répertoire en un geste.",
            "Ingiza majina, simu na anwani za wateja moja kwa moja kutoka kitabu cha simu."
        ),
        "perm_sms_title" to locEntry(
            "Direct SMS Messaging",
            "Kohereza Ubutumwa bwa SMS",
            "Messagerie SMS Directe",
            "Ujumbe wa SMS wa Moja kwa Moja"
        ),
        "perm_sms_desc" to locEntry(
            "Send instant official SMS payment reminders, debt alerts, and sale receipts directly to customers.",
            "Kohereza ubutumwa bwa SMS bw'amadeni, inyemezabuguzi na raporo z'ubucuruzi ako kanya.",
            "Envoyez instantanément rappels de paiement, alertes de dette et reçus par SMS.",
            "Tuma vikumbusho vya malipo, taarifa za madeni na risiti za SMS kwa wateja."
        ),
        "perm_camera_title" to locEntry(
            "Camera Barcode Scanner",
            "Kamera yo Gusoma Barcode",
            "Scanner Caméra Code-barres",
            "Kichanganuzi cha Kamera (Barcode)"
        ),
        "perm_camera_desc" to locEntry(
            "Scan product barcodes and collaborator QR passes directly using your device camera.",
            "Gusoma barcode z'ibicuruzwa na QR pass z'abakozi ukoresheje kamera ya telefoni.",
            "Scannez codes-barres produits et badges QR d'équipe avec la caméra.",
            "Changanua barcode za bidhaa na QR za wafanyakazi kwa kamera yako."
        ),
        "perm_notif_title" to locEntry(
            "Business Alerts & Notifications",
            "Imenyesha ry'Ubucuruzi",
            "Alertes & Notifications Métier",
            "Arifa za Biashara"
        ),
        "perm_notif_desc" to locEntry(
            "Receive instant alerts when stock runs out, debt payment is due, or branch shift finishes.",
            "Kumenyeshwa ibicuruzwa bishize mu bubiko, amadeni arangiye n'amasaha y'akazi.",
            "Recevez des alertes en cas de rupture de stock, échéance de dette ou fin de service.",
            "Pokea arifa stoo inapoisha, deni linapohitajika kulipwa au zamu inapoisha."
        ),
        "perm_wifi_title" to locEntry(
            "Nearby Branch LAN Sync",
            "Guhuza Amashami kuri Wi-Fi",
            "Sync Wi-Fi Locale d'Agences",
            "Usawazishaji wa Matawi kwa Wi-Fi"
        ),
        "perm_wifi_desc" to locEntry(
            "Discover local master POS hubs over Wi-Fi without requiring device location access.",
            "Kubona amashami ari kuri Wi-Fi imwe mudakenera GPS.",
            "Découvrez les terminaux POS locaux en Wi-Fi sans activer le GPS.",
            "Gundua vituo vya POS kwenye Wi-Fi ya karibu bila kuhitaji GPS."
        ),

        // =====================================================================
        // RECEIPT DIALOG & CAMERA SCANNER
        // =====================================================================
        "rec_sale_completed" to locEntry("Sale Completed", "Igurisha Ryagenze Neza", "Vente Terminée", "Mauzo Yamekamilika"),
        "rec_receipt_num_colon" to locEntry("Receipt #:", "Inyemezabuguzi #:", "Reçu # :", "Risiti #:"),
        "rec_date_colon" to locEntry("Date:", "Itariki:", "Date :", "Tarehe:"),
        "rec_customer_colon" to locEntry("Customer:", "Umukiriya:", "Client :", "Mteja:"),
        "rec_payment_colon" to locEntry("Payment:", "Uburyo:", "Paiement :", "Malipo:"),
        "rec_total_upper" to locEntry("TOTAL", "IGITERANYO", "TOTAL", "JUMLA"),
        "rec_incl_tax_fmt" to locEntry(
            "Incl. Tax (%s%%):",
            "Harimo Umusoro (%s%%):",
            "Dont TVA (%s%%) :",
            "Ikijumuisha Kodi (%s%%):"
        ),
        "rec_discount_colon" to locEntry("Discount:", "Kugabanyiriza:", "Remise :", "Punguzo:"),
        "rec_amount_paid_colon" to locEntry("Amount Paid:", "Ayishyuwe:", "Montant payé :", "Kiasi Kilicholipwa:"),
        "rec_balance_due_colon" to locEntry("Debt / Balance Due:", "Umwenda Usigaye:", "Dette / Solde dû :", "Deni Linalobaki:"),
        "rec_seal_fmt" to locEntry(
            "Offline Verification Seal: %s",
            "Kashe y'Ubuziranenge Offline: %s",
            "Sceau de vérification hors ligne : %s",
            "Muhuri wa Uthibitisho Nje ya Mtandao: %s"
        ),
        "rec_share_pdf" to locEntry("Share PDF", "Sangiza PDF", "Partager PDF", "Shiriki PDF"),
        "rec_print_pos" to locEntry("Print POS", "Sohora POS", "Imprimer POS", "Chapisha POS"),
        "rec_copy_text_sms" to locEntry(
            "Copy Plain Text / SMS Format",
            "Koporora Inyandiko / SMS",
            "Copier Texte / Format SMS",
            "Nakili Maandishi / SMS"
        ),
        "rec_copied_toast" to locEntry(
            "Receipt text copied to clipboard!",
            "Inyemezabuguzi yakoporowe neza!",
            "Texte du reçu copié !",
            "Maandishi ya risiti yamenakiliwa!"
        ),
        "rec_print_err_fmt" to locEntry(
            "Unable to launch print service: %s",
            "Ntibishoboye gusohora ku mashini: %s",
            "Impossible de lancer l'impression : %s",
            "Imeshindwa kuanzisha uchapishaji: %s"
        ),
        "rec_print_job_fmt" to locEntry(
            "BeBoss Receipt #%s",
            "Inyemezabuguzi ya BeBoss #%s",
            "Reçu BeBoss #%s",
            "Risiti ya BeBoss #%s"
        ),

        "scan_title" to locEntry("Barcode / QR Scanner", "Gusoma Barcode na QR", "Scanner Code-barres / QR", "Kichanganuzi cha Barcode / QR"),
        "scan_flash_cd" to locEntry("Torch", "Itara", "Lampe Torche", "Tochi"),
        "scan_perm_required_title" to locEntry("Camera Permission Required", "Hakenewe Uburenganzira bwa Kamera", "Permission Caméra Requise", "Ruhusa ya Kamera Inahitajika"),
        "scan_perm_required_desc" to locEntry(
            "Camera permission is required to scan barcodes",
            "Uburenganzira bwa kamera burakenewe ngo usome barcode",
            "L'autorisation de la caméra est requise pour scanner les codes-barres",
            "Ruhusa ya kamera inahitajika kuchanganua barcode"
        ),
        "scan_grant_camera_btn" to locEntry("Grant Permission", "Emeza Uburenganzira", "Autoriser la Caméra", "Ruhusu Kamera"),
        "scan_manual_placeholder" to locEntry("Or enter barcode manually...", "Cyangwa injiza barcode mu ntoki...", "Ou entrez le code manuellement...", "Au weka barcode kwa mkono..."),
        "scan_match_meta_fmt" to locEntry("Price: %s %s • Stock: %d %s", "Igiciro: %s %s • Ububiko: %d %s", "Prix : %s %s • Stock : %d %s", "Bei: %s %s • Stoo: %d %s"),
        "scan_add_btn" to locEntry("Add", "Ongeramo", "Ajouter", "Ongeza"),
        "scan_close_btn" to locEntry("Close Scanner", "Funga Kamera", "Fermer le Scanner", "Funga Kichanganuzi"),
        "scan_guide_hint" to locEntry(
            "Align product barcode or QR pass inside the scanning frame",
            "Shyira barcode cyangwa QR mu ruziga rwo gusoma",
            "Alignez le code-barres ou le QR dans le cadre",
            "Weka barcode au QR ndani ya fremu ya kuchanganua"
        ),
        "scan_flash_on" to locEntry("Flash ON", "Itara RIRAKA", "Flash ACTIVÉ", "Tochi IMEWASHWA"),
        "scan_flash_off" to locEntry("Flashlight", "Itara", "Lampe Torche", "Tochi"),

        // =====================================================================
        // QUICK ACTIONS SHEET & UNIVERSAL SEARCH
        // =====================================================================
        "qa_subtitle" to locEntry(
            "Instant cashier & business shortcuts",
            "Ibikorwa byihuse by'umucuruzi n'ubucuruzi",
            "Raccourcis caisse et gestion instantanés",
            "Njia za mkato za keshia na biashara"
        ),
        "qa_custom_sale_sub" to locEntry("Instant cash/momo sale", "Gurisha ako kanya na cash/MoMo", "Vente directe cash/MoMo", "Mauzo ya papo hapo"),
        "qa_add_product_sub" to locEntry("Add new stock item", "Ongeramo igicuruzwa gishya", "Ajouter un article en stock", "Ongeza bidhaa mpya stooni"),
        "qa_new_customer_sub" to locEntry("Record debtor / buyer", "Andika umukiriya cyangwa ideni", "Ajouter client / débiteur", "Sajili mdaiwa / mnunuzi"),
        "qa_universal_search_sub" to locEntry("Find items & clients", "Shakisha ibicuruzwa n'abakiriya", "Trouver articles & clients", "Tafuta bidhaa na wateja"),
        "qa_daily_whatsapp_sub" to locEntry("Share shop summary", "Sangiza raporo y'ububiko", "Partager résumé boutique", "Shiriki muhtasari wa duka"),
        "qa_last_receipt_sub" to locEntry("Reprint or share", "Sohora cyangwa sangiza", "Réimprimer ou partager", "Chapisha au shiriki"),
        "qa_quick_sale_subtitle" to locEntry(
            "Fast cashier checkout for uncatalogued items or quick service",
            "Gucuruza byihuse ibicuruzwa bitanditse cyangwa serivisi zihuse",
            "Encaissement rapide pour articles libres ou services",
            "Malipo ya haraka kwa bidhaa zisizo kwenye orodha au huduma"
        ),
        "qa_amount_example" to locEntry("e.g. 2500", "urugero: 2500", "ex. 2500", "mf. 2500"),
        "qa_payment_method_colon" to locEntry("Payment Method:", "Uburyo bwo Kwishyura:", "Mode de paiement :", "Njia ya Malipo:"),
        "qa_method_cash" to locEntry("Cash", "Cash", "Espèces", "Taslimu"),
        "qa_method_momo" to locEntry("MoMo", "MoMo", "MoMo", "MoMo"),
        "qa_method_airtel" to locEntry("Airtel", "Airtel", "Airtel", "Airtel"),
        "qa_method_debt" to locEntry("Debt", "Umwenda", "Dette", "Deni"),
        "qa_err_valid_amount" to locEntry("Please enter a valid amount", "Injiza amafaranga y'ukuri arenze zeru", "Veuillez entrer un montant valide", "Tafadhali weka kiasi sahihi"),
        "qa_item_example" to locEntry("e.g. Airtime, Cold Soda, Repair", "urugero: Inyunganizi, Fanta, Serivisi", "ex. Crédit appel, Soda, Réparation", "mf. Muda wa maongezi, Soda, Ukarabati"),
        "search_dialog_title" to locEntry("Universal Smart Search", "Gushakisha muri Byose", "Recherche Globale Intelligente", "Utafutaji Mkuu wa Jumla"),
        "search_pill_all_fmt" to locEntry("All (%d)", "Byose (%d)", "Tout (%d)", "Zote (%d)"),
        "search_pill_stock_fmt" to locEntry("Stock (%d)", "Ububiko (%d)", "Stock (%d)", "Stoo (%d)"),
        "search_pill_people_fmt" to locEntry("People (%d)", "Abakiriya (%d)", "Clients (%d)", "Wateja (%d)"),
        "search_pill_sales_fmt" to locEntry("Sales (%d)", "Ibyagurishijwe (%d)", "Ventes (%d)", "Mauzo (%d)"),
        "search_pill_inflow_fmt" to locEntry("Inflow (%d)", "Ibyaguzwe (%d)", "Achats (%d)", "Manunuzi (%d)"),
        "search_clear_cd" to locEntry("Clear", "Siba", "Effacer", "Futa"),
        "search_placeholder" to locEntry("Search products, debtors, receipts, vendors...", "Shakisha ibicuruzwa, abakiriya, inyemezabuguzi...", "Chercher produits, débiteurs, reçus, vendeurs...", "Tafuta bidhaa, wadaiwa, risiti, wasambazaji..."),
        "search_header_products" to locEntry("Products & Live Inventory", "Ibicuruzwa & Ububiko", "Produits & Stock en Direct", "Bidhaa & Stoo Hai"),
        "search_header_customers" to locEntry("Customers & Debt Ledger", "Abakiriya & Amadeni", "Clients & Créances", "Wateja & Kitabu cha Madeni"),
        "search_header_sales" to locEntry("Sales Receipts", "Inyemezabuguzi", "Reçus de Vente", "Risiti za Mauzo"),
        "search_header_purchases" to locEntry("Purchases & Inflow Orders", "Ibyaguzwe & Ibyinjiye", "Achats & Commandes", "Manunuzi & Oda"),
        "search_no_phone" to locEntry("No phone registered", "Nta terefone yanditse", "Aucun numéro enregistré", "Hakuna simu iliyosajiliwa"),
        "search_restock_btn" to locEntry("Restock", "Ongera", "Réappro", "Jaza"),
        "search_sell_btn" to locEntry("Sell", "Gurisha", "Vendre", "Uza"),
        "search_backorder_btn" to locEntry("Sell (Backorder)", "Gurisha (Bitariho)", "Vendre (Précommande)", "Uza (Agiza)"),
        "search_debt_fmt" to locEntry("Debt: %d %s", "Umwenda: %d %s", "Dette : %d %s", "Deni: %d %s"),
        "search_vendor_total_fmt" to locEntry("Vendor: %s • Total: %d %s", "Uwabigemuye: %s • Igiteranyo: %d %s", "Fournisseur : %s • Total : %d %s", "Msambazaji: %s • Jumla: %d %s"),
        "search_in_stock_fmt" to locEntry("%d %s • %d in stock", "%d %s • %d mu bubiko", "%d %s • %d en stock", "%d %s • %d stooni"),

        // =====================================================================
        // PURCHASES LEDGER VIEW EXTRA KEYS
        // =====================================================================
        "pur_sheet_title" to locEntry("Purchases & Inflow Spreadsheet", "Imbonerahamwe y'Ibyaguzwe", "Feuille Achats & Réappros", "Jedwali la Manunuzi & Mapokezi"),
        "pur_orders_logged_fmt" to locEntry("%d Orders Logged", "Ibyatumijwe %d", "%d Commandes", "Oda %d"),
        "pur_total_bought_upper" to locEntry("TOTAL BOUGHT VALUE", "AGACIRO K'IBYAGUZWE", "VALEUR ACHATS TOTALE", "JUMLA YA MANUNUZI"),
        "pur_units_restocked_upper" to locEntry("UNITS RESTOCKED", "INGANO YINJIYE", "UNITÉS RÉAPPRO", "VIPIMO VILIVYOJAZWA"),
        "pur_units_fmt" to locEntry("%d Units", "Ibicuruzwa %d", "%d Unités", "Vipimo %d"),
        "pur_suppliers_upper" to locEntry("SUPPLIERS", "ABABIGEMUYE", "FOURNISSEURS", "WASAMBAZAJI"),
        "pur_vendors_fmt" to locEntry("%d Vendors", "Abagemura %d", "%d Vendeurs", "Wasambazaji %d"),
        "pur_share_csv_title" to locEntry("Share Purchases Spreadsheet CSV", "Sangiza Imbonerahamwe CSV", "Partager Feuille Achats CSV", "Shiriki Jedwali la Manunuzi CSV"),
        "pur_export_err_fmt" to locEntry("Export error: %s", "Ikosa mu gusohora: %s", "Erreur d'export : %s", "Hitilafu ya uhamishaji: %s"),
        "pur_export_excel_csv" to locEntry("Export Excel CSV", "Sohora Excel CSV", "Exporter Excel CSV", "Hamisha Excel CSV"),
        "pur_buy_restock_btn" to locEntry("+ Buy / Restock In", "+ Gura / Ongera Ububiko", "+ Acheter / Réappro", "+ Nunua / Jaza Stoo"),
        "pur_search_placeholder" to locEntry("Search by product, vendor, PO number...", "Shakisha igicuruzwa, uwabigemuye, PO...", "Chercher produit, vendeur, bon...", "Tafuta bidhaa, msambazaji, PO..."),
        "pur_view_colon" to locEntry("View: ", "Isura: ", "Vue : ", "Mwonekano: "),
        "pur_view_excel" to locEntry("Excel Table", "Imbonerahamwe", "Tableau Excel", "Jedwali la Excel"),
        "pur_view_cards" to locEntry("Cards", "Amakarita", "Cartes", "Kadi"),
        "pur_sort_cd" to locEntry("Sort Direction", "Kurikiza uko bikurikirana", "Sens de tri", "Mwelekeo wa kupanga"),
        "pur_empty_title" to locEntry("No purchase records found", "Nta byaguzwe bibonetse", "Aucun achat trouvé", "Hakuna rekodi za manunuzi"),
        "pur_empty_sub" to locEntry("Tap '+ Buy / Restock In' above to record stock received from suppliers.", "Kanda '+ Gura / Ongera Ububiko' hejuru wandike ibyakiriwe.", "Appuyez sur « + Acheter / Réappro » ci-dessus pour enregistrer les arrivages.", "Gusa '+ Nunua / Jaza Stoo' hapo juu kurekodi mzigo mpya."),
        "pur_col_po_ref" to locEntry("PO Ref", "Inyandiko PO", "Réf PO", "Kumb. PO"),
        "pur_col_date" to locEntry("Date", "Itariki", "Date", "Tarehe"),
        "pur_col_product_name" to locEntry("Product Name", "Izina ry'Igicuruzwa", "Produit", "Jina la Bidhaa"),
        "pur_col_supplier_vendor" to locEntry("Supplier / Vendor", "Uwabigemuye", "Fournisseur", "Msambazaji"),
        "pur_col_qty_in" to locEntry("Qty In", "Ingano", "Qté Reçue", "Idadi"),
        "pur_col_sell_price" to locEntry("Sell Price", "Ugurisha", "Prix Vente", "Bei Uza"),
        "pur_col_est_profit" to locEntry("Est. Profit", "Inyungu", "Profit Est.", "Faida Makadirio"),
        "pur_col_actions" to locEntry("Actions", "Ibikorwa", "Actions", "Vitendo"),
        "pur_card_supplier" to locEntry("Supplier", "Uwabigemuye", "Fournisseur", "Msambazaji"),
        "pur_card_qty_in" to locEntry("Quantity In", "Ingano Yinjiye", "Quantité Reçue", "Idadi Iliyoingia"),
        "pur_card_units_plus_fmt" to locEntry("+%d units", "+ibipimo %d", "+%d unités", "+vipimo %d"),
        "pur_card_total_outflow" to locEntry("Total Outflow", "Ayishyuwe", "Total Payé", "Jumla Iliyolipwa"),
        "pur_add_dialog_title" to locEntry("Record Stock In / Purchase", "Andika Ibyaguzwe mu Bubiko", "Enregistrer Arrivage / Achat", "Rekodi Stoo Mpya / Manunuzi"),
        "pur_select_product_restock" to locEntry("Select Product to Restock", "Hitamo Igicuruzwa", "Sélectionner un produit", "Chagua Bidhaa ya Kujaza"),
        "pur_select_product_hint" to locEntry("Select a product", "Hitamo igicuruzwa", "Choisir un produit", "Chagua bidhaa"),
        "pur_dropdown_in_stock_fmt" to locEntry("%s (%d in stock)", "%s (%d mu bubiko)", "%s (%d en stock)", "%s (%d stooni)"),
        "pur_qty_bought_label" to locEntry("Quantity Bought", "Ingano Yaguzwe", "Quantité Achetée", "Idadi Iliyonunuliwa"),
        "pur_unit_cost_currency_fmt" to locEntry("Unit Cost (%s)", "Ikiguzi/1 (%s)", "Coût Unitaire (%s)", "Gharama/1 (%s)"),
        "pur_sell_price_currency_fmt" to locEntry("Selling Price (%s)", "Igiciro Ugurisha (%s)", "Prix de Vente (%s)", "Bei ya Kuuza (%s)"),
        "pur_po_invoice_optional" to locEntry("PO / Invoice Number (Optional)", "Nimero ya Fakitire (Si ngombwa)", "N° Facture / Bon (Optionnel)", "Namba ya Ankara / PO (Hiari)"),
        "pur_total_cost_colon" to locEntry("Total Purchase Cost:", "Igiteranyo cy'Ikiguzi:", "Coût d'Achat Total :", "Jumla ya Gharama:"),
        "pur_expected_profit_colon" to locEntry("Expected Profit:", "Inyungu Itegerejwe:", "Bénéfice Attendu :", "Faida Inayotarajiwa:"),
        "pur_save_restock_btn" to locEntry("Save & Restock", "Bika & Ongera Ububiko", "Enregistrer & Ajouter", "Hifadhi & Jaza Stoo"),

        // =====================================================================
        // BRANCH MANAGEMENT DIALOG
        // =====================================================================
        "br_active_view_fmt" to locEntry(
            "Viewing: %s",
            "Ishami Rirebwa: %s",
            "Vue active : %s",
            "Tawi Linalotazamwa: %s"
        ),
        "br_all_branches_label" to locEntry("All Branches (HQ)", "Amashami Yose (HQ)", "Toutes les agences (Siège)", "Matawi Yote (Makao Makuu)"),
        "br_empty_list" to locEntry(
            "No custom branches created yet. Tap 'Add New Branch' to expand!",
            "Nta shami ryari ryandikwa. Kanda 'Ongeraho Ishami' utangire!",
            "Aucune agence secondaire créée. Appuyez sur « Nouvelle agence » !",
            "Hakuna tawi lililoongezwa bado. Gusa 'Ongeza Tawi Jipya'!"
        ),
        "br_code_prefix_fmt" to locEntry("Code: %s", "Kode: %s", "Code : %s", "Msimbo: %s"),
        "br_manager_prefix_fmt" to locEntry("Manager: %s", "Umuyobozi: %s", "Gérant : %s", "Meneja: %s"),
        "br_active_filter_badge" to locEntry("ACTIVE VIEW", "RIRAKORA", "ACTIF", "LINATUMIKA"),
        "br_filter_btn" to locEntry("Switch View", "Reba Ishami", "Basculer", "Tazama"),
        "br_tab_branches" to locEntry("Branches", "Amashami", "Agences", "Matawi"),
        "br_tab_transfers" to locEntry("Stock Transfers", "Iyimurwa ry'Ububiko", "Transferts Stock", "Uhamisho wa Stoo"),
        "br_tab_analytics" to locEntry("Performance", "Imikorere", "Performance", "Utendaji"),
        "br_new_transfer_btn" to locEntry("New Stock Transfer", "Imura Ibicuruzwa Hagati y'Amashami", "Nouveau Transfert de Stock", "Uhamisho Mpya wa Stoo"),
        "br_no_transfers" to locEntry("No inter-branch stock transfers recorded yet.", "Nta yimurwa ry'ibicuruzwa rirakorwa.", "Aucun transfert inter-agences enregistré.", "Hakuna uhamisho wa stoo uliofanyika."),
        "br_analytics_header" to locEntry("Revenue & Earnings per Branch", "Inyungu & Ibyagurishijwe kuri buri Shami", "Revenus & Performances par Agence", "Mapato na Utendaji kwa Kila Tawi"),
        "br_transfer_dialog_title" to locEntry("Transfer Stock Between Branches", "Imura Ibicuruzwa mu Rindi Shami", "Transférer du Stock entre Agences", "Hamisha Stoo Kati ya Matawi"),
        "br_from_branch_label" to locEntry("From Branch", "Biva mu Shami", "Agence source", "Kutoka Tawi"),
        "br_to_branch_label" to locEntry("To Branch", "Bijya mu Shami", "Agence destinataire", "Kwenda Tawi"),
        "br_qty_transfer_label" to locEntry("Quantity to Transfer *", "Ingano Imurwa *", "Quantité à transférer *", "Idadi ya Kuhamisha *"),
        "br_execute_transfer_btn" to locEntry("Complete Stock Transfer", "Emeza Iyimurwa", "Valider le Transfert", "Kamilisha Uhamisho"),
        "br_form_edit_title" to locEntry("Edit Branch", "Hindura Ishami", "Modifier l'Agence", "Hariri Tawi"),
        "br_form_new_title" to locEntry("Create New Branch", "Fata Ishami Rishya", "Créer une Nouvelle Agence", "Unda Tawi Jipya"),
        "br_manager_name_label" to locEntry("Branch Manager Name", "Amazina y'Umuyobozi", "Nom du Gérant", "Jina la Meneja wa Tawi"),
        "br_set_main_hq_toggle" to locEntry("Set as Main HQ Branch", "Shyira nk'Ishami Rikuru (HQ)", "Définir comme Siège Principal", "Weka kama Tawi Kuu"),
        "br_delete_confirm_title" to locEntry("Delete Branch?", "Usiba Ishami?", "Supprimer l'Agence ?", "Futa Tawi?"),
        "br_delete_confirm_msg_fmt" to locEntry(
            "Delete branch '%s'? Existing sales remain linked by ID.",
            "Usiba ishami '%s'? Amakuru y'ibyagurishijwe azagumaho.",
            "Supprimer l'agence « %s » ? Les ventes restent conservées.",
            "Futa tawi '%s'? Mauzo ya awali yatabaki yamehifadhiwa."
        ),

        // =====================================================================
        // STAFF MANAGEMENT DIALOG (INCLUDING ALL 12 GRANULAR PERMISSIONS)
        // =====================================================================
        "stf_empty_list" to locEntry(
            "No team accounts found.",
            "Nta bakozi banditswe.",
            "Aucun compte d'équipe trouvé.",
            "Hakuna akaunti za wafanyakazi."
        ),
        "stf_add_member_btn" to locEntry("Add Staff Member", "Ongeramo Umukozi", "Ajouter un Collaborateur", "Ongeza Mfanyakazi"),
        "stf_all_branches_hq" to locEntry("All Branches (HQ)", "Amashami Yose (HQ)", "Toutes les agences (Siège)", "Matawi Yote (Makao Makuu)"),
        "stf_whatsapp_invite" to locEntry("WhatsApp Invite", "Tanga ku WhatsApp", "Inviter WhatsApp", "Alika WhatsApp"),
        "stf_pdf_pass" to locEntry("PDF Pass", "Karita PDF", "Badge PDF", "Kadi ya PDF"),
        "stf_form_edit_title" to locEntry("Edit Collaborator", "Hindura Umukozi", "Modifier le Collaborateur", "Hariri Mfanyakazi"),
        "stf_form_new_title" to locEntry("Add Collaborator / Cashier", "Andika Umukozi Mushya", "Ajouter Caissier / Gérant", "Ongeza Mfanyakazi / Keshia"),
        "stf_full_name_label" to locEntry("Full Name *", "Amazina Yuzuye *", "Nom complet *", "Jina Kamili *"),
        "stf_username_label" to locEntry("Username *", "Izina ryo Kwinjira *", "Identifiant *", "Jina la Kuingia *"),
        "stf_role_label" to locEntry("System Role", "Inshingano mu Bubiko", "Rôle Système", "Wajibu wa Mfumo"),
        "stf_pin_4digit_label" to locEntry("4-Digit Login PIN", "PIN yo Kwinjira (4)", "Code PIN à 4 chiffres", "PIN ya Kuingia (4)"),
        "stf_pin_change_optional" to locEntry("New 4-Digit PIN (Blank to keep)", "PIN nshya (Sigaho ubusa utahinduye)", "Nouveau PIN 4 chiffres (Optionnel)", "PIN Mpya (Acha wazi kutunza)"),
        "stf_err_pin_digits" to locEntry("PIN must be exactly 4 numeric digits.", "PIN igomba kuba imibare 4 neza.", "Le PIN doit contenir exactement 4 chiffres.", "PIN lazima iwe tarakimu 4."),
        "stf_permissions_header" to locEntry("Granular Access Permissions", "Uburenganzira Bwihariye", "Permissions d'Accès Détaillées", "Ruhusa Maalum za Ufikiaji"),
        "stf_perm_pos" to locEntry("Sell at POS Terminal", "Gucuruza kuri POS", "Vendre au Point de Vente", "Kuuza Kwenye Kituo cha POS"),
        "stf_perm_discount" to locEntry("Apply Discounts", "Kugabanyiriza Ibiciro", "Appliquer des Remises", "Kutoa Punguzo la Bei"),
        "stf_perm_inventory" to locEntry("Manage Stock & Products", "Gucunga Ububiko", "Gérer le Stock & Produits", "Kusimamia Stoo na Bidhaa"),
        "stf_perm_cost_profit" to locEntry("View Buy Cost & Profit", "Kureba Ikiguzi & Inyungu", "Voir Prix d'Achat & Bénéfices", "Kuona Bei ya Kununua & Faida"),
        "stf_perm_analytics" to locEntry("View Analytics & P/L", "Kureba Raporo & Inyungu", "Voir Analyses & Pertes/Profits", "Kuona Takwimu & Faida"),
        "stf_perm_customers" to locEntry("Manage Customers", "Kwandika Abakiriya", "Gérer les Clients", "Kusimamia Wateja"),
        "stf_perm_debt" to locEntry("Collect Customer Debts", "Kwakira Amadeni", "Encaisser les Dettes", "Kukusanya Madeni"),
        "stf_perm_delete" to locEntry("Delete Sales & Items", "Gusiba Amakuru", "Supprimer Ventes & Articles", "Kufuta Mauzo & Bidhaa"),
        "stf_perm_export_pdf" to locEntry("Export PDF Reports", "Gusohora Raporo za PDF", "Exporter Rapports PDF", "Kuhamisha Ripoti za PDF"),
        "stf_perm_team" to locEntry("Manage Team Accounts", "Gucunga Abakozi", "Gérer l'Équipe", "Kusimamia Wafanyakazi"),
        "stf_perm_settings" to locEntry("Edit Shop Settings", "Guhindura Igenamiterere", "Modifier Paramètres Boutique", "Kuhariri Mipangilio ya Duka"),
        "stf_perm_backup" to locEntry("Backup & Restore Data", "Bika & Garura Kopi", "Sauvegarder & Restaurer", "Hifadhi Nakala & Rejesha"),
        "stf_save_member_btn" to locEntry("Save Staff Member", "Bika Umukozi", "Enregistrer Collaborateur", "Hifadhi Mfanyakazi"),
        "stf_delete_confirm_title" to locEntry("Delete Staff Account?", "Usiba Konti y'Umukozi?", "Supprimer le compte ?", "Futa Akaunti ya Mfanyakazi?"),

        // =====================================================================
        // SHOP DEVICES DIALOG
        // =====================================================================
        "dev_dialog_subtitle" to locEntry(
            "Pair multiple cashier phones & POS tablets to sync automatically",
            "Huza telefoni nyinshi z'abacuruzi kugira ngo zisangire amakuru",
            "Appairez plusieurs téléphones caissiers pour une synchronisation auto",
            "Unganisha simu nyingi za keshia kusawazisha kiotomatiki"
        ),
        "dev_pairing_notice" to locEntry(
            "Each paired device gets a unique Join Code (BB-...). Give it to your cashier during 'Join Existing Shop' setup.",
            "Buri telefoni ihabwa Kode yo Kwinjira (BB-...). Yihe umucuruzi mu gihe yinjira mu duka ririho.",
            "Chaque appareil reçoit un code (BB-...) à saisir lors de « Rejoindre Boutique ».",
            "Kila kifaa hupata msimbo wa kujiunga (BB-...). Mpe keshia wakati wa 'Jiunge na Duka'."
        ),
        "dev_created_banner_title" to locEntry(
            "New Device Paired!",
            "Telefoni Nshya Yanditswe!",
            "Nouvel Appareil Ajouté !",
            "Kifaa Kipya Kimeundwa!"
        ),
        "dev_join_code_fmt" to locEntry(
            "Join Code: %s",
            "Kode yo Kwinjira: %s",
            "Code d'Appairage : %s",
            "Msimbo wa Kujiunga: %s"
        ),
        "dev_created_hint" to locEntry(
            "On the secondary phone, open BeBoss -> 'Join Existing Shop' and enter owner @username, phone & this Join Code.",
            "Kuri telefoni nshya, fungura BeBoss -> 'Injira mu Duka Ririho' hanyuma winjize @username ya nyir'iduka, terefone n'iyi kode.",
            "Sur le téléphone secondaire, ouvrez BeBoss -> « Rejoindre Boutique » et saisissez ces identifiants.",
            "Kwenye simu ya pili, fungua BeBoss -> 'Jiunge na Duka' na weka jina la mmiliki, simu na msimbo huu."
        ),
        "dev_empty_state" to locEntry(
            "No secondary cashier devices paired yet. Your 1st owner phone is included free.",
            "Nta yindi telefoni irahuzwa. Telefoni ya mbere ya nyir'iduka iri mu ifatabuguzi ku buntu.",
            "Aucun autre appareil appairé. Votre 1er téléphone propriétaire est inclus.",
            "Hakuna vifaa vya ziada vilivyounganishwa bado. Simu ya kwanza ya mmiliki ni bure."
        ),
        "dev_status_active" to locEntry("ACTIVE", "IRAKORA", "ACTIF", "HAI"),
        "dev_status_paused" to locEntry("PAUSED", "YAHAGARITSWE", "SUSPENDU", "IMESITISHWA"),
        "dev_form_title" to locEntry("Pair New POS Device", "Huza Telefoni Nshya ya POS", "Appairer un Nouvel Appareil POS", "Unganisha Kifaa Kipya cha POS"),
        "dev_name_label" to locEntry("Device Name *", "Izina rya Telefoni *", "Nom de l'appareil *", "Jina la Kifaa *"),
        "dev_name_placeholder" to locEntry("e.g. Counter 2 Tablet", "urugero: Telefoni ya Kontwari 2", "ex. Tablette Caisse 2", "mf. Kishikwambi cha Kaunta 2"),
        "dev_assigned_staff_label" to locEntry("Assigned Staff Member *", "Umukozi Uyikoresha *", "Collaborateur assigné *", "Mfanyakazi Anayehusika *"),
        "dev_create_cta" to locEntry("Generate Join Code", "Kora Kode yo Kwinjira", "Générer le Code", "Tengeneza Msimbo"),

        // =====================================================================
        // DIAGNOSTICS, DATA TRANSFER & SYNC HUB DIALOGS
        // =====================================================================
        "diag_title" to locEntry("Security & Sync Diagnostics", "Isuzuma ry'Umutekano & Sync", "Diagnostics Sécurité & Sync", "Uchunguzi wa Usalama & Usawazishaji"),
        "diag_tab_overview" to locEntry("Hardware & Security", "Umutekano", "Sécurité", "Usalama"),
        "diag_tab_sync" to locEntry("Sync Queue", "Umurongo wa Sync", "File Sync", "Foleni ya Sync"),
        "diag_tab_database" to locEntry("Database", "Ububiko DB", "Base BD", "Hifadhidata"),
        "diag_tab_audit" to locEntry("Audit Logs", "Ubugenzuzi", "Journal Audit", "Ukaguzi"),
        "diag_integrity_ok" to locEntry("Hardware Integrity Verified", "Igikoresho Kirizewe", "Intégrité Matérielle Vérifiée", "Uadilifu wa Kifaa Umethibitishwa"),
        "diag_integrity_warn" to locEntry("Security Anomaly Flagged", "Hari Ikibazo cy'Umutekano", "Anomalie de Sécurité Détectée", "Tahadhari ya Usalama Imegunduliwa"),
        "diag_keystore_label" to locEntry("Crypto Keystore:", "Ububiko bw'Imfunguzo:", "Coffre Clés :", "Hifadhi ya Funguo:"),
        "diag_root_check" to locEntry("Root / Tamper Status:", "Imiterere ya Root:", "État Root :", "Hali ya Root:"),
        "diag_verify_db_btn" to locEntry("Verify SQLCipher Integrity", "Genzura Ubuziranenge bwa DB", "Vérifier Intégrité SQLCipher", "Kagua Uadilifu wa SQLCipher"),
        "diag_optimize_db_btn" to locEntry("Optimize & Checkpoint WAL", "Tunganya DB & WAL", "Optimiser & WAL", "Boresha DB & WAL"),
        "diag_force_sync_btn" to locEntry("Force Cloud Sync Now", "Ohereza kuri Cloud Nonaha", "Forcer Sync Cloud", "Lazimisha Usawazishaji Sasa"),
        "diag_no_audit_logs" to locEntry("No audit entries recorded yet.", "Nta bikorwa birandikwa mu bugenzuzi.", "Aucune entrée d'audit enregistrée.", "Hakuna rekodi za ukaguzi bado."),
        "diag_pending_queue_fmt" to locEntry("Pending Sync Items: %d", "Itegereje Koherezwa: %d", "Éléments en attente : %d", "Vipengee Vinavyosubiri: %d"),
        "diag_dead_letter_fmt" to locEntry("Dead-Letter Failures: %d", "Ibyananiranye: %d", "Échecs permanents : %d", "Vilivyoshindwa: %d"),

        "dt_title" to locEntry("Offline Backup, Restore & Export", "Kopi y'Ububiko, Kugarura & Gusohora", "Sauvegarde Hors Ligne, Restauration & Export", "Nakala, Kurejesha & Kuhamisha Data"),
        "dt_tab_backup" to locEntry("JSON Backup", "Kopi JSON", "Sauvegarde JSON", "Nakala JSON"),
        "dt_tab_restore" to locEntry("Restore / Import", "Garura Kopi", "Restaurer / Importer", "Rejesha / Ingiza"),
        "dt_tab_sheets" to locEntry("Excel CSV", "Excel CSV", "Excel CSV", "Excel CSV"),
        "dt_backup_desc" to locEntry(
            "Export an encrypted-ready full JSON snapshot of all branches, stock, customers, debts, and sales.",
            "Sohora kopi yuzuye y'ibicuruzwa, abakiriya, amadeni n'ibyagurishijwe mu buryo bwa JSON.",
            "Exportez une archive JSON complète des agences, stocks, clients, dettes et ventes.",
            "Hamisha nakala kamili ya JSON ya matawi, stoo, wateja, madeni na mauzo."
        ),
        "dt_export_full_btn" to locEntry("Export Full Shop Package", "Sohora Kopi Yuzuye", "Exporter Paquet Complet", "Hamisha Pakiti Kamili"),
        "dt_share_token_btn" to locEntry("Copy Branch Share Token", "Koporora Kode y'Ishami", "Copier Jeton d'Agence", "Nakili Tokeni ya Tawi"),
        "dt_restore_hint" to locEntry("Pick a .json backup file or paste a branch transfer token below:", "Hitamo dosiye ya .json cyangwa ushyiremo kode hano hasi:", "Choisissez un fichier .json ou collez un jeton d'agence ci-dessous :", "Chagua faili ya .json au bandika tokeni ya tawi chini:"),
        "dt_pick_json_btn" to locEntry("Browse .JSON Backup File", "Hitamo Dosiye .JSON", "Parcourir Fichier .JSON", "Chagua Faili .JSON"),
        "dt_apply_token_btn" to locEntry("Import from Token / Text", "Injiza uvanye kuri Kode", "Importer depuis Jeton", "Ingiza kutoka Tokeni"),
        "dt_csv_sheets_desc" to locEntry(
            "Generate universal Excel-compatible CSV spreadsheets for accounting and audits.",
            "Kora imbonerahamwe za Excel CSV z'ibicuruzwa, ibyagurishijwe n'abakiriya.",
            "Générez des feuilles Excel CSV pour la comptabilité et les audits.",
            "Tengeneza majedwali ya Excel CSV kwa uhasibu na ukaguzi."
        ),
        "dt_export_products_csv" to locEntry("Export Products Sheet (.csv)", "Sohora Ibicuruzwa (.csv)", "Exporter Produits (.csv)", "Hamisha Bidhaa (.csv)"),
        "dt_export_sales_csv" to locEntry("Export Sales Ledger (.csv)", "Sohora Ibyagurishijwe (.csv)", "Exporter Ventes (.csv)", "Hamisha Mauzo (.csv)"),
        "dt_export_customers_csv" to locEntry("Export Customers & Debts (.csv)", "Sohora Abakiriya & Amadeni (.csv)", "Exporter Clients & Dettes (.csv)", "Hamisha Wateja & Madeni (.csv)"),

        "hub_title" to locEntry("Multi-Branch LAN & Cloud Sync Hub", "Urubuga rwo Guhuza Amashami & Cloud", "Hub de Synchronisation LAN & Cloud", "Kituo cha Usawazishaji wa LAN & Wingu"),
        "hub_tab_cloud" to locEntry("Cloud Sync", "Cloud", "Cloud", "Wingu"),
        "hub_tab_lan" to locEntry("Wi-Fi LAN Hub", "Wi-Fi LAN", "LAN Wi-Fi", "LAN ya Wi-Fi"),
        "hub_tab_history" to locEntry("Sync Logs", "Amateka", "Journal", "Rekodi"),
        "hub_cloud_live_title" to locEntry("Supabase Enterprise Cloud Sync", "Guhuza na Supabase Cloud", "Synchronisation Cloud Supabase", "Usawazishaji wa Wingu wa Supabase"),
        "hub_test_ping_btn" to locEntry("Test Latency / Ping", "Pima Umuvuduko (Ping)", "Tester Latence / Ping", "Jaribu Muunganisho (Ping)"),
        "hub_push_now_btn" to locEntry("Sync Bidirectionally Now", "Huza Byose Nonaha", "Synchroniser Maintenant", "Sawazisha Pande Zote Sasa"),
        "hub_lan_server_title" to locEntry("Master POS Wi-Fi Server (Host Mode)", "Seriveri ya Wi-Fi y'Ishami Rikuru", "Serveur Wi-Fi POS Principal", "Seva ya Wi-Fi ya POS Kuu"),
        "hub_lan_start_btn" to locEntry("Start LAN Sync Server", "Tangira Seriveri ya Wi-Fi", "Démarrer Serveur LAN", "Anzisha Seva ya LAN"),
        "hub_lan_stop_btn" to locEntry("Stop LAN Sync Server", "Hagarika Seriveri ya Wi-Fi", "Arrêter Serveur LAN", "Simamisha Seva ya LAN"),
        "hub_lan_discover_btn" to locEntry("Scan Wi-Fi for Branches", "Shakisha Amashami kuri Wi-Fi", "Scanner Wi-Fi Agences", "Tafuta Matawi Kwenye Wi-Fi"),
        "hub_lan_manual_ip_label" to locEntry("Master Hub IP Address", "IP ya Seriveri Nkuru", "Adresse IP du Hub Principal", "Anwani ya IP ya Kituo Kikuu"),
        "hub_lan_connect_btn" to locEntry("Sync with Master IP", "Huza na IP", "Synchroniser avec IP", "Sawazisha na IP")
    )
}
