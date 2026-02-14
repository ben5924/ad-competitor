import { driver } from "driver.js";

export const startOnboarding = (actions: { navigate: (view: any) => void, markComplete: () => void }) => {
    const driverObj = driver({
        showProgress: true,
        animate: true,
        doneBtnText: "C'est parti !",
        nextBtnText: "Suivant",
        prevBtnText: "Précédent",
        popoverClass: 'driverjs-theme',
        steps: [
            {
                element: '#sidebar-logo',
                popover: {
                    title: 'Bienvenue sur MetaScan',
                    description: 'Découvrez comment analyser les stratégies publicitaires de vos concurrents en quelques minutes.',
                    side: "right",
                    align: 'start'
                }
            },
            {
                element: '#sidebar-competitors',
                popover: {
                    title: 'Gestion des Concurrents',
                    description: 'Tout commence ici. Cliquez pour gérer vos marques suivies.',
                    side: "right",
                    align: "center"
                },
                onHighlightStarted: () => actions.navigate('COMPETITORS')
            },
            {
                element: '#add-competitor-form',
                popover: {
                    title: 'Ajouter un Concurrent',
                    description: 'Entrez simplement l\'ID de la page Facebook (ex: 9246289234) pour commencer le tracking.',
                    side: "top"
                }
            },
            {
                element: '#category-manager',
                popover: {
                    title: 'Organisez par Catégorie',
                    description: 'Créez des groupes (ex: Fashion, Tech) pour segmenter votre veille concurrentielle.',
                    side: "top"
                }
            },
            {
                element: '#sidebar-dashboard',
                popover: {
                    title: 'Tableau de Bord',
                    description: 'Retournons à la vue d\'ensemble.',
                    side: "right",
                    align: "center"
                },
                onHighlightStarted: () => actions.navigate('DASHBOARD')
            },
             {
                element: '#category-tabs',
                popover: {
                    title: 'Filtrer par Groupe',
                    description: 'Utilisez ces onglets pour afficher uniquement les concurrents d\'une catégorie spécifique.',
                    side: "bottom"
                }
            },
            {
                element: '#competitor-ranking-table',
                popover: {
                    title: 'Classement & Synchronisation',
                    description: 'Comparez les performances. Utilisez le bouton "Sync" (Refresh) pour mettre à jour l\'analyse Média (Vidéo vs Image).',
                    side: "top"
                }
            },
            {
                element: '#chart-section',
                popover: {
                    title: 'Analyses Graphiques',
                    description: 'Visualisez l\'évolution du Reach, du Budget et de la stratégie Média.',
                    side: "top"
                }
            },
            {
                element: '#sidebar-hitparade',
                popover: {
                    title: 'Hit Parade',
                    description: 'Découvrez le classement des meilleures publicités par audience.',
                    side: "right",
                    align: "center"
                },
                onHighlightStarted: () => actions.navigate('HIT_PARADE')
            },
            {
                element: '#hitparade-filters',
                popover: {
                    title: 'Filtres Avancés',
                    description: 'Trouvez les meilleures vidéos pour les 18-24 ans ou les images performantes chez les seniors.',
                    side: "bottom"
                }
            },
            {
                element: '#sidebar-ads',
                popover: {
                    title: 'Ad Explorer',
                    description: 'Explorez la créativité. Filtrez, triez et analysez chaque publicité en détail.',
                    side: "right",
                    align: "center"
                },
                onHighlightStarted: () => actions.navigate('ADS')
            },
             {
                element: '#ai-analysis-btn',
                popover: {
                    title: 'Analyse IA',
                    description: 'Laissez Gemini analyser la stratégie globale, le ton et les angles marketing de vos concurrents.',
                    side: "bottom"
                }
            }
        ],
        onDestroyStarted: () => {
            actions.markComplete();
            driverObj.destroy();
        }
    });

    driverObj.drive();
};