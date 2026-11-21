package com.beboss.shopmgmt.util

internal object LocalizationAdminOps {
    val entries: Map<String, Map<AppLanguage, String>> = mapOf(
        // =====================================================================
        // MASTER ADMIN CONSOLE (9 TABS + MODALS)
        // =====================================================================
        "adm_sign_in_title" to locEntry("Master Admin Sign In", "Kwinjira nka Master Admin", "Connexion Master Admin", "Kuingia kwa Msimamizi Mkuu"),
        "adm_sign_up_title" to locEntry("Register Master Admin", "Andika Master Admin Mushya", "Créer un Compte Admin", "Sajili Msimamizi Mkuu"),
        "adm_email_label" to locEntry("Admin Email", "Imeli ya Admin", "Email Admin", "Barua Pepe ya Admin"),
        "adm_fullname_label" to locEntry("Full Name", "Amazina Yuzuye", "Nom complet", "Jina Kamili"),
        "adm_sign_in_btn" to locEntry("Sign In to Cloud Admin", "Injira muri Cloud Admin", "Se Connecter Admin", "Ingia Admin ya Wingu"),
        "adm_create_admin_btn" to locEntry("Create Admin Account", "Kora Konti ya Admin", "Créer Compte Admin", "Unda Akaunti ya Admin"),
        "adm_toggle_signup" to locEntry("New admin? Register account", "Uri mushya? Iyandikishe", "Nouvel admin ? Créer un compte", "Admin mpya? Jisajili hapa"),
        "adm_toggle_signin" to locEntry("Already registered? Sign In", "Usanzwe ufite konti? Injira", "Déjà inscrit ? Se connecter", "Una akaunti tayari? Ingia"),
        "adm_refresh_btn" to locEntry("Refresh", "Vugurura", "Actualiser", "Onyesha Upya"),
        "adm_web_portal_btn" to locEntry("Web Portal", "Urubuga Web", "Portail Web", "Tovuti"),
        "adm_sign_out_btn" to locEntry("Sign Out", "Sohoka", "Déconnexion", "Ondoka"),
        "adm_kpi_pending" to locEntry("Pending Pay", "Bitegereje", "En attente", "Zinazosubiri"),
        "adm_kpi_shops" to locEntry("Active Shops", "Amaduka", "Boutiques", "Maduka Hai"),
        "adm_kpi_revenue" to locEntry("Verified Rev", "Ayemejwe", "Revenus", "Mapato"),
        "adm_kpi_codes" to locEntry("Live Codes", "Amakode", "Codes Actifs", "Misimbo Hai"),
        "adm_batch_approve_btn" to locEntry("Batch Approve All Pending", "Emeza Byose Bitegereje", "Tout Approuver", "Idhinisha Zote Zinazosubiri"),
        "adm_approve_issue_btn" to locEntry("Approve & Issue BB2", "Emeza & Tanga BB2", "Approuver & Code BB2", "Idhinisha & Toa BB2"),
        "adm_direct_unlock_btn" to locEntry("Direct Auto-Unlock", "Fungura Ako Kanya", "Déblocage Direct", "Fungua Moja kwa Moja"),
        "adm_reject_btn" to locEntry("Reject", "Hakana", "Rejeter", "Kataa"),
        "adm_send_code_whatsapp" to locEntry("Send Code via WhatsApp", "Ohereza kuri WhatsApp", "Envoyer par WhatsApp", "Tuma kwa WhatsApp"),
        "adm_reject_modal_title" to locEntry("Reject Payment Submission", "Hakana Gihamya y'Ubwishyu", "Rejeter le Paiement", "Kataa Uthibitisho wa Malipo"),
        "adm_reject_reason_label" to locEntry("Rejection Reason *", "Impamvu yo Guhakana *", "Motif du rejet *", "Sababu ya Kukataa *"),
        "adm_save_pay_config_btn" to locEntry("Save Live Payment Config", "Bika Igenamiterere ry'Ubwishyu", "Enregistrer Config Paiement", "Hifadhi Mipangilio ya Malipo"),
        "adm_tier_label" to locEntry("Plan Tier", "Icyiciro", "Formule", "Kiwango cha Mpango"),
        "adm_days_valid_label" to locEntry("Days Valid", "Iminsi", "Jours valides", "Siku Halali"),
        "adm_amount_paid_label" to locEntry("Amount (FRw)", "Amafaranga (FRw)", "Montant (FRw)", "Kiasi (FRw)"),
        "adm_extend_30d" to locEntry("+30d", "+30d", "+30j", "+Siku 30"),
        "adm_reset_trial" to locEntry("Reset Trial", "Garura Igerageza", "Réinit. Essai", "Weka Upya Jaribio"),
        "adm_suspend_btn" to locEntry("Suspend", "Hagarika", "Suspendre", "Simamisha"),
        "adm_activate_btn" to locEntry("Activate", "Fungura", "Activer", "Washa"),
        "adm_revoke_code_btn" to locEntry("Revoke Code", "Hagarika Kode", "Révoquer Code", "Batilisha Msimbo"),
        "adm_no_pending_payments" to locEntry("All pending payments have been reviewed!", "Nta bwishyu butegereje bugihari.", "Aucun paiement en attente.", "Hakuna malipo yanayosubiri."),
        "adm_no_shops" to locEntry("No shop accounts synced yet.", "Nta maduka aragera kuri cloud.", "Aucune boutique synchronisée.", "Hakuna maduka yaliyosawazishwa."),
        "adm_no_users" to locEntry("No shop users synced yet.", "Nta bakozi baragera kuri cloud.", "Aucun utilisateur synchronisé.", "Hakuna watumiaji waliosawazishwa."),
        "adm_no_devices" to locEntry("No paired shop devices found.", "Nta telefoni z'amaduka zibonetse.", "Aucun appareil boutique trouvé.", "Hakuna vifaa vya duka vilivyopatikana."),
        "adm_no_codes" to locEntry("No unlock codes issued yet.", "Nta makode aratangwa.", "Aucun code BB2 émis.", "Hakuna misimbo iliyotolewa bado."),
        "adm_no_branches" to locEntry("No cloud branch snapshots synced yet.", "Nta mashami aragera kuri cloud.", "Aucune agence synchronisée.", "Hakuna matawi yaliyosawazishwa."),
        "adm_no_audit" to locEntry("No audit entries recorded yet.", "Nta bugenzuzi burakorwa.", "Aucun journal d'audit disponible.", "Hakuna rekodi za ukaguzi bado."),

        // =====================================================================
        // ENUM DISPLAY HELPERS & PAYMENT LABELS
        // =====================================================================
        "role_owner_full" to locEntry("Shop Owner (Full Access)", "Nyir'Ububiko (Byose)", "Propriétaire (Accès Complet)", "Mmiliki wa Duka (Ufikiaji Wote)"),
        "role_manager_full" to locEntry("Store Manager (Inventory & Ops)", "Umuyobozi w'Ububiko", "Gérant (Stock & Opérations)", "Meneja wa Duka (Stoo & Shughuli)"),
        "role_cashier_full" to locEntry("Cashier (POS Checkout)", "Umucuruzi (POS)", "Caissier (Point de Vente)", "Keshia (Kituo cha Mauzo)"),
        "cust_cat_regular" to locEntry("Regular Customer", "Umukiriya Usanzwe", "Client Régulier", "Mteja wa Kawaida"),
        "cust_cat_wholesale" to locEntry("Wholesaler / Trader", "Umucuruzi wa En Gros", "Grossiste / Commerçant", "Mfanyabiashara wa Jumla"),
        "cust_cat_vip" to locEntry("VIP Credit Partner", "Umufatanyabikorwa wa VIP", "Partenaire Crédit VIP", "Mshirika wa Mkopo wa VIP"),
        "cust_cat_retail" to locEntry("Walk-in Shopper", "Umuguzi wo ku Muhanda", "Client de Passage", "Mnunuzi wa Kawaida"),

        // =====================================================================
        // VIEWMODEL, COORDINATORS, RATE LIMITER & SUBSCRIPTION ENGINE
        // =====================================================================
        "vm_cart_held_fmt" to locEntry(
            "Cart held safely (%s)",
            "Igitebo cyabitswe neza (%s)",
            "Panier mis en attente (%s)",
            "Kikapu kimehifadhiwa (%s)"
        ),
        "vm_cart_resumed_fmt" to locEntry(
            "Resumed cart (%s)",
            "Igitebo cyagaruwe (%s)",
            "Panier repris (%s)",
            "Kikapu kimerejeshwa (%s)"
        ),
        "vm_split_mismatch_fmt" to locEntry(
            "Split payment mismatch: enter Cash + MoMo totaling %s",
            "Kuvanga amafaranga ntibihuye: Cash + MoMo bigomba kungana na %s",
            "Total mixte invalide : Espèces + MoMo doivent égaler %s",
            "Malipo mchanganyiko hayalingani: Taslimu + MoMo lazima ziwe %s"
        ),
        "vm_storage_full_err" to locEntry(
            "Device storage full! Free up space to save sales.",
            "Ububiko bwa telefoni bwuzuye! Siba bimwe kugira ngo ubike.",
            "Stockage appareil plein ! Libérez de l'espace pour enregistrer.",
            "Hifadhi ya kifaa imejaa! Futa nafasi kuhifadhi mauzo."
        ),
        "vm_checkout_err_fmt" to locEntry(
            "Error completing sale: %s",
            "Ikosa mu kwemeza igurisha: %s",
            "Erreur lors de la validation : %s",
            "Hitilafu kukamilisha mauzo: %s"
        ),
        "vm_quick_sale_done_fmt" to locEntry(
            "Quick Sale completed: %s",
            "Igurisha ryihuse ryarangiye: %s",
            "Vente rapide terminée : %s",
            "Mauzo ya haraka yamekamilika: %s"
        ),
        "vm_added_to_cart_fmt" to locEntry(
            "Added %s to cart",
            "%s yongewe mu gitebo",
            "%s ajouté au panier",
            "%s imeongezwa kikapuni"
        ),
        "vm_no_receipts_yet" to locEntry(
            "No completed sales receipts yet.",
            "Nta nyemezabuguzi zirakorwa kugeza ubu.",
            "Aucun reçu de vente disponible.",
            "Hakuna risiti za mauzo zilizokamilika bado."
        ),
        "vm_daily_whatsapp_report_fmt" to locEntry(
            "*DAILY SHOP REPORT — %s*\nDate: %s\nOrders: %d\nRevenue: %s\nEst. Profit: %s\nOutstanding Debts: %s\n\n_Generated by BeBoss Offline POS_",
            "*RAPORO Y'UMUNSI — %s*\nItariki: %s\nInyemezabuguzi: %d\nAmafaranga Yinjiye: %s\nInyungu Yitezwe: %s\nAmadeni Asigaye: %s\n\n_Byakozwe na BeBoss POS_",
            "*RAPPORT QUOTIDIEN — %s*\nDate : %s\nCommandes : %d\nRevenus : %s\nBénéfice est. : %s\nCréances : %s\n\n_Généré par BeBoss POS_",
            "*RIPOTI YA SIKU — %s*\nTarehe: %s\nOda: %d\nMapato: %s\nFaida ya Makadirio: %s\nMadeni: %s\n\n_Imetolewa na BeBoss POS_"
        ),
        "vm_db_optimized_fmt" to locEntry(
            "Database optimized! Size: %s KB, WAL synced.",
            "Ububiko bwatunganijwe! Ingano: %s KB.",
            "Base de données optimisée ! Taille : %s Ko.",
            "Hifadhidata imeboreshwa! Ukubwa: %s KB."
        ),
        "vm_db_integrity_ok" to locEntry(
            "PRAGMA integrity_check OK — All tables verified!",
            "Ubuziranenge bw'ububiko bwemejwe (PRAGMA OK)!",
            "PRAGMA integrity_check OK — Tables vérifiées !",
            "Ukaguzi wa hifadhidata sawa — Majedwali yote salama!"
        ),
        "vm_db_integrity_fail_fmt" to locEntry(
            "Integrity warning: %s",
            "Iburira ry'ububiko: %s",
            "Alerte d'intégrité : %s",
            "Onyo la uadilifu: %s"
        ),
        "vm_sample_seeded" to locEntry(
            "Demo retail catalog loaded!",
            "Ibicuruzwa by'icyitegererezo byashyizwemo!",
            "Catalogue de démonstration chargé !",
            "Orodha ya bidhaa ya mfano imepakiwa!"
        ),
        "vm_sync_cloud_pushed_fmt" to locEntry(
            "Synced %d items to cloud!",
            "Amakuru %d yoherejwe kuri Cloud neza!",
            "%d éléments synchronisés avec le Cloud !",
            "Vipengee %d vimesawazishwa na Wingu!"
        ),
        "vm_sync_offline_queued" to locEntry(
            "Offline — changes queued safely for next connection.",
            "Nta internet — impinduka zibitswe neza zizoherezwa.",
            "Hors ligne — modifications en file d'attente.",
            "Nje ya mtandao — mabadiliko yamehifadhiwa kwa usawazishaji."
        ),
        "vm_join_success" to locEntry(
            "Device paired and shop synced! Welcome to BeBoss.",
            "Telefoni yahujwe n'iduka neza! Murakaza neza muri BeBoss.",
            "Appareil appairé et boutique synchronisée ! Bienvenue.",
            "Kifaa kimeunganishwa na duka limesawazishwa! Karibu BeBoss."
        ),
        "vm_join_err_invalid" to locEntry(
            "Invalid owner username, phone, or device join code.",
            "Username ya nyir'iduka, terefone cyangwa kode yo kwinjira si byo.",
            "Identifiant, téléphone ou code d'appairage invalide.",
            "Jina la mmiliki, simu au msimbo wa kujiunga si sahihi."
        ),
        "vm_admin_approve_ok_fmt" to locEntry(
            "Approved! Code %s issued.",
            "Byemejwe! Kode %s yatanzwe.",
            "Approuvé ! Code %s émis.",
            "Imeidhinishwa! Msimbo %s umetolewa."
        ),
        "vm_admin_auto_unlock_ok" to locEntry(
            "Shop auto-unlocked via cloud!",
            "Iduka ryafunguwe ako kanya kuri Cloud!",
            "Boutique déverrouillée directement via le Cloud !",
            "Duka limefunguliwa moja kwa moja kupitia Wingu!"
        ),
        "vm_admin_config_saved" to locEntry(
            "Live payment configuration saved!",
            "Igenamiterere ry'ubwishyu ryabitswe neza!",
            "Configuration de paiement enregistrée !",
            "Mipangilio ya malipo imehifadhiwa!"
        ),
        "vm_admin_reject_done" to locEntry(
            "Payment request rejected.",
            "Ubusabe bw'ubwishyu bwanzwe.",
            "Demande de paiement rejetée.",
            "Ombi la malipo limekataliwa."
        ),
        "rate_limit_locked_fmt" to locEntry(
            "Too many failed attempts (%d). Try again in %ds.",
            "Wagerageje kenshi bidasubirwaho (%d). Ongera nyuma y'amasegonda %d.",
            "Trop de tentatives (%d). Réessayez dans %ds.",
            "Majaribio mengi yameshindwa (%d). Jaribu tena baada ya sekunde %d."
        ),
        "rate_limit_lockout_now_fmt" to locEntry(
            "Locked for %ds after %d failed attempts.",
            "Hafunzwe amasegonda %d nyuma yo kwibeshya inshuro %d.",
            "Verrouillé %ds après %d tentatives échouées.",
            "Imefungwa kwa sekunde %d baada ya kushindwa mara %d."
        ),
        "rate_limit_left_fmt" to locEntry(
            "%d attempt(s) remaining before temporary lockout.",
            "Hasigaye kugerageza inshuro %d mbere yo gufungwa by'agateganyo.",
            "%d tentative(s) restante(s) avant verrouillage temporaire.",
            "Majaribio %d yamebaki kabla ya kufungwa kwa muda."
        ),
        "pin_err_length" to locEntry(
            "PIN must be between 4 and 6 numeric digits",
            "PIN igomba kuba iri hagati y'imibare 4 na 6",
            "Le PIN doit contenir 4 à 6 chiffres",
            "PIN lazima iwe kati ya tarakimu 4 na 6"
        ),
        "pin_err_identical" to locEntry(
            "PIN cannot consist of identical repeated digits",
            "PIN ntishobora kuba imibare imwe isubiramo",
            "Le PIN ne peut pas contenir uniquement des chiffres identiques",
            "PIN haiwezi kuwa na tarakimu zinazofanana pekee"
        ),
        "pin_err_sequential" to locEntry(
            "PIN cannot be simple sequential numbers (e.g. 1234)",
            "PIN ntishobora gukurikirana byoroshye (nk'1234)",
            "Le PIN ne peut pas être une suite simple (ex. 1234)",
            "PIN haiwezi kuwa mfuatano rahisi wa namba (mf. 1234)"
        ),
        "pin_err_weak" to locEntry(
            "PIN is too predictable; use at least 3 distinct non-paired digits",
            "PIN iroroshye cyane; koresha imibare itatu itandukanye nibura",
            "PIN trop prévisible ; utilisez au moins 3 chiffres distincts",
            "PIN inatabirika kwa urahisi; tumia angalau tarakimu 3 tofauti"
        ),
        "pin_ok_strong" to locEntry("Strong PIN", "PIN Ikomeye", "PIN Fort", "PIN Imara"),
        "pass_err_length" to locEntry("Password must be at least 8 characters long", "Ijambobanga rigomba kuba nibura inyuguti 8", "Le mot de passe doit contenir au moins 8 caractères", "Nenosiri lazima liwe na herufi angalau 8"),
        "pass_err_complexity" to locEntry("Password must include uppercase, lowercase letters, and numbers", "Ijambobanga rigomba kugira inyuguti nkuru, nto n'imibare", "Incluez majuscules, minuscules et chiffres", "Nenosiri lazima liwe na herufi kubwa, ndogo na namba"),
        "pass_err_common" to locEntry("Choose a less common administrative password", "Hitamo irindi jambobanga rihishe kurushaho", "Choisissez un mot de passe moins courant", "Chagua nenosiri lisilo la kawaida"),
        "pass_ok_strong" to locEntry("Strong Password", "Ijambobanga Rikomeye", "Mot de passe fort", "Nenosiri Imara")
    )
}
